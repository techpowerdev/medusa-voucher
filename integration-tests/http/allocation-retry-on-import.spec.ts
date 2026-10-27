import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import { AllocationFailureStatus } from "../../src/modules/voucher/constants"
import VoucherModuleService from "../../src/modules/voucher/service"
import { allocateVouchersForPaidOrderWorkflow } from "../../src/workflows/allocate-vouchers-for-paid-order"
import { createAdminHeaders } from "../helpers/admin"
import { createOrder, createVoucherProductVariant, payOrderInFull } from "../helpers/vouchers"

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ api, getContainer }) => {
    describe("Importing a Voucher batch serves the orders waiting for its Vouchers", () => {
      let headers: Awaited<ReturnType<typeof createAdminHeaders>>
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)

      beforeEach(async () => {
        headers = await createAdminHeaders(getContainer())
      })

      afterEach(() => jest.restoreAllMocks())

      // A Paid order that found the Pool short, so it waits on an open failure.
      const waitingOrder = async (product: { variantId: string }, quantity: number) => {
        const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity }])
        const payment = await payOrderInFull(getContainer(), order.id, quantity * 100)
        await allocateVouchersForPaidOrderWorkflow(getContainer()).run({ input: { order_id: order.id } })

        return { ...order, payment }
      }

      const importCodes = (voucherProductId: string, codes: string[]) =>
        api
          .post(
            "/admin/voucher-batches/import",
            {
              voucher_product_id: voucherProductId,
              purchased_at: "2026-10-01",
              csv: ["code", ...codes].join("\n"),
            },
            headers
          )
          .catch((error) => error.response)

      it("allocates the waiting orders oldest first and returns the retry result", async () => {
        const product = await createVoucherProductVariant(getContainer())
        const older = await waitingOrder(product, 2)
        const newer = await waitingOrder(product, 2)

        const response = await importCodes(product.voucherProductId, ["IMPORT-0001", "IMPORT-0002"])

        expect(response.status).toBe(201)
        expect(response.data.imported).toBe(2)
        expect(response.data.allocation_retry).toEqual({
          allocated: [older.id],
          still_open: [newer.id],
          failed: [],
        })
        const allocations = await service().listVoucherAllocations({ order_id: older.id })
        expect(allocations.map((a) => a.unit_index).sort()).toEqual([1, 2])
        const [stillWaiting] = await service().listVoucherAllocationFailures({ order_id: newer.id })
        expect(stillWaiting.status).toBe(AllocationFailureStatus.OPEN)
      })

      it("leaves an order refunded or canceled while it waited open", async () => {
        const product = await createVoucherProductVariant(getContainer())
        const refunded = await waitingOrder(product, 1)
        const canceled = await waitingOrder(product, 1)
        await getContainer()
          .resolve(Modules.PAYMENT)
          .refundPayment({ payment_id: refunded.payment.id, amount: 100 })
        await getContainer().resolve(Modules.ORDER).cancel(canceled.id)

        const response = await importCodes(product.voucherProductId, ["GONE-0001", "GONE-0002"])

        expect(response.status).toBe(201)
        expect(response.data.allocation_retry).toEqual({
          allocated: [],
          still_open: [refunded.id, canceled.id],
          failed: [],
        })
        for (const order of [refunded, canceled]) {
          expect(await service().listVoucherAllocations({ order_id: order.id })).toEqual([])
          const [failure] = await service().listVoucherAllocationFailures({ order_id: order.id })
          expect(failure.status).toBe(AllocationFailureStatus.OPEN)
        }
      })

      it("keeps the imported Vouchers and says the retry did not run when it throws", async () => {
        const product = await createVoucherProductVariant(getContainer())
        const order = await waitingOrder(product, 1)
        jest
          .spyOn(service(), "listVoucherAllocationFailures")
          .mockRejectedValue(new Error("database unavailable"))
        const error = jest.spyOn(getContainer().resolve(ContainerRegistrationKeys.LOGGER), "error")

        const response = await importCodes(product.voucherProductId, ["KEPT-0001"])

        expect(response.status).toBe(201)
        expect(response.data.imported).toBe(1)
        expect(response.data.allocation_retry).toBeNull()
        const vouchers = await service().listVouchers({ batch_id: response.data.voucher_batch.id })
        expect(vouchers).toHaveLength(1)
        expect(await service().listVoucherAllocations({ order_id: order.id })).toEqual([])
        const messages = error.mock.calls.map((call) => String(call[0]))
        expect(
          messages.filter(
            (m) => m.includes(product.voucherProductId) && m.includes("database unavailable")
          )
        ).toHaveLength(1)
      })
    })
  },
})
