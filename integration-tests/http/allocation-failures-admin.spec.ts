import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import VoucherModuleService from "../../src/modules/voucher/service"
import { allocateVouchersForPaidOrderWorkflow } from "../../src/workflows/allocate-vouchers-for-paid-order"
import { createAdminHeaders } from "../helpers/admin"
import {
  createOrder,
  createVoucherProductVariant,
  payOrderInFull,
  stockVouchers,
} from "../helpers/vouchers"

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ api, getContainer }) => {
    describe("Allocation failures (admin API)", () => {
      let headers: Awaited<ReturnType<typeof createAdminHeaders>>
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)

      beforeEach(async () => {
        headers = await createAdminHeaders(getContainer())
      })

      // A Paid order for `quantity` units of a Voucher product whose Pool holds `stocked`.
      const waitingOrder = async (title: string, quantity: number, stocked: number) => {
        const product = await createVoucherProductVariant(getContainer(), title)
        await stockVouchers(
          getContainer(),
          product,
          Array.from({ length: stocked }, (_, i) => ({ code: `SECRET-${title}-${i + 1}` }))
        )
        const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity }])
        await payOrderInFull(getContainer(), order.id, quantity * 100)
        await allocateVouchersForPaidOrderWorkflow(getContainer()).run({ input: { order_id: order.id } })

        return { product, order }
      }

      describe("GET /admin/allocation-failures", () => {
        it("lists open failures with the order, the Voucher product and both counts, never a secret", async () => {
          const { product, order } = await waitingOrder("100", 3, 1)

          const response = await api.get("/admin/allocation-failures", headers)

          expect(response.status).toBe(200)
          expect(response.data.allocation_failures).toEqual([
            expect.objectContaining({
              order_id: order.id,
              order_line_item_id: order.items![0].id,
              voucher_product_id: product.voucherProductId,
              quantity_requested: 3,
              quantity_available: 1,
              status: "open",
            }),
          ])
          expect(response.data.count).toBe(1)
          expect(JSON.stringify(response.data)).not.toMatch(/SECRET-|code_encrypted|pin_encrypted|code_hash/)
        })

        it("lists only the failures of the Voucher product asked for", async () => {
          await waitingOrder("100", 2, 0)
          const { product, order } = await waitingOrder("200", 2, 0)

          const response = await api.get(
            `/admin/allocation-failures?voucher_product_id=${product.voucherProductId}`,
            headers
          )

          expect(response.data.allocation_failures.map((f: { order_id: string }) => f.order_id)).toEqual([
            order.id,
          ])
        })

        it("refuses a request without an admin session", async () => {
          const response = await api.get("/admin/allocation-failures").catch((error) => error.response)

          expect(response.status).toBe(401)
        })
      })

      describe("POST /admin/voucher-products/:id/retry-allocation-failures", () => {
        it("allocates the waiting orders the Pool now covers and reports the rest", async () => {
          const { product, order } = await waitingOrder("100", 2, 0)
          await stockVouchers(getContainer(), product, [{ code: "SECRET-NEW-1" }, { code: "SECRET-NEW-2" }])

          const response = await api.post(
            `/admin/voucher-products/${product.voucherProductId}/retry-allocation-failures`,
            {},
            headers
          )

          expect(response.status).toBe(200)
          expect(response.data).toEqual({ allocated: [order.id], still_open: [], failed: [] })
          expect(await service().listVoucherAllocations({ order_id: order.id })).toHaveLength(2)
          expect(JSON.stringify(response.data)).not.toMatch(/SECRET-/)
        })

        it("refuses an unknown Voucher product", async () => {
          const response = await api
            .post("/admin/voucher-products/vprod_missing/retry-allocation-failures", {}, headers)
            .catch((error) => error.response)

          expect(response.status).toBe(404)
          expect(response.data.message).toBe("Voucher product vprod_missing was not found")
        })
      })

      describe("POST /admin/allocation-failures/:id/resolve", () => {
        const resolve = (id: string, body: Record<string, unknown>) =>
          api
            .post(`/admin/allocation-failures/${id}/resolve`, body, headers)
            .catch((error) => error.response)

        it("resolves a failure with the note, the admin who did it and when", async () => {
          const { order } = await waitingOrder("100", 1, 0)
          const [failure] = await service().listAllocationFailures({ order_id: order.id })

          const response = await resolve(failure.id, { note: "Refunded the customer" })

          expect(response.status).toBe(200)
          expect(response.data.allocation_failure).toEqual(
            expect.objectContaining({
              id: failure.id,
              status: "resolved",
              resolution_note: "Refunded the customer",
              resolved_by: expect.stringMatching(/^user_/),
            })
          )
          expect(response.data.allocation_failure.resolved_at).toBeTruthy()
        })

        it("refuses a failure that is already resolved", async () => {
          const { order } = await waitingOrder("100", 1, 0)
          const [failure] = await service().listAllocationFailures({ order_id: order.id })
          await resolve(failure.id, { note: "First" })

          const response = await resolve(failure.id, { note: "Second" })

          expect(response.status).toBe(422)
          const [unchanged] = await service().listAllocationFailures({ id: failure.id })
          expect(unchanged.resolution_note).toBe("First")
        })

        it("lets only one of two admins resolving at the same moment succeed", async () => {
          const { order } = await waitingOrder("100", 1, 0)
          const [failure] = await service().listAllocationFailures({ order_id: order.id })

          const responses = await Promise.all([
            resolve(failure.id, { note: "First" }),
            resolve(failure.id, { note: "Second" }),
          ])

          expect(responses.map((response) => response.status).sort()).toEqual([200, 422])
          const winner = responses.find((response) => response.status === 200)
          const [stored] = await service().listAllocationFailures({ id: failure.id })
          expect(stored.resolution_note).toBe(winner.data.allocation_failure.resolution_note)
        })

        it("refuses an unknown failure", async () => {
          const response = await resolve("vfail_missing", { note: "Nothing" })

          expect(response.status).toBe(404)
          expect(response.data.message).toBe("Allocation failure vfail_missing was not found")
        })

        it("requires a note", async () => {
          const { order } = await waitingOrder("100", 1, 0)
          const [failure] = await service().listAllocationFailures({ order_id: order.id })

          const response = await resolve(failure.id, { note: "  " })

          expect(response.status).toBe(400)
        })
      })
    })
  },
})
