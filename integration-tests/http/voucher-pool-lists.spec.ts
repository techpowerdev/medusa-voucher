import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import { VoucherStatus } from "../../src/modules/voucher/constants"
import VoucherModuleService from "../../src/modules/voucher/service"
import { allocateVouchersForPaidOrderWorkflow } from "../../src/workflows/allocate-vouchers-for-paid-order"
import { createAdminHeaders } from "../helpers/admin"
import {
  createOrder,
  createVoucherProductVariant,
  payOrderInFull,
  stockVouchers,
} from "../helpers/vouchers"

const DAY = 24 * 60 * 60 * 1000

jest.setTimeout(60 * 1000)

// Allocations here only give Vouchers an order. Read by the test application's configuration
// in the runner's beforeAll.
process.env.VOUCHER_TEST_DELIVERY_AUTOMATIC = "false"

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ api, getContainer }) => {
    describe("A Voucher product's batches and Vouchers (admin API)", () => {
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)
      let headers: Awaited<ReturnType<typeof createAdminHeaders>>

      beforeEach(async () => {
        headers = await createAdminHeaders(getContainer())
      })

      afterAll(() => {
        delete process.env.VOUCHER_TEST_DELIVERY_AUTOMATIC
      })

      const inDays = (days: number) => new Date(Date.now() + days * DAY)
      const get = (url: string) => api.get(url, headers).catch((error) => error.response)

      // Two purchases: September's two Vouchers (one already expired) and October's three
      // (one open-ended, one with 3 days left, one ending on 31 December 2026 in Bangkok).
      const twoBatches = async () => {
        const product = await createVoucherProductVariant(getContainer(), "100")
        const september = await stockVouchers(
          getContainer(),
          product,
          [
            { code: "LISTS-SEPT-0001-AAAA", valid_until: inDays(60) },
            { code: "LISTS-SEPT-0002-BBBB", valid_from: inDays(-30), valid_until: inDays(-1) },
          ],
          { purchased_at: new Date("2026-09-01T00:00:00Z"), reference: "PO-0901", unit_cost: 95 }
        )
        const october = await stockVouchers(
          getContainer(),
          product,
          [
            { code: "LISTS-OCT-0001-CCCC" },
            { code: "LISTS-OCT-0002-DDDD", valid_until: inDays(3) },
            {
              code: "LISTS-OCT-0003-EEEE",
              valid_from: new Date("2026-10-31T17:00:00Z"),
              valid_until: new Date("2026-12-31T17:00:00Z"),
            },
          ],
          {
            purchased_at: new Date("2026-10-01T00:00:00Z"),
            reference: "PO-1001",
            unit_cost: 92,
            redemption_instructions: "Show the code at the counter",
          }
        )

        return { product, september, october }
      }

      const noSecrets = (data: unknown) =>
        expect(JSON.stringify(data)).not.toMatch(/LISTS-|code_hash|code_encrypted|pin_encrypted/)

      describe("batches", () => {
        it("lists batches newest purchase first, each with its details and counts", async () => {
          const { product, october } = await twoBatches()

          const response = await get(`/admin/voucher-products/${product.voucherProductId}/batches`)

          expect(response.status).toBe(200)
          expect(response.data.count).toBe(2)
          expect(response.data.batches).toEqual([
            expect.objectContaining({
              id: october[0].batch_id,
              reference: "PO-1001",
              unit_cost: 92,
              redemption_instructions: "Show the code at the counter",
              purchased_at: "2026-10-01T00:00:00.000Z",
              counts: { available: 2, expired: 0, under_minimum: 1, allocated: 0, delivered: 0, void: 0 },
            }),
            expect.objectContaining({
              reference: "PO-0901",
              unit_cost: 95,
              counts: { available: 1, expired: 1, under_minimum: 0, allocated: 0, delivered: 0, void: 0 },
            }),
          ])
          noSecrets(response.data)
        })

        it("gives each batch its purchase day in the plugin's time zone", async () => {
          const product = await createVoucherProductVariant(getContainer(), "100")
          // 00:30 on 1 October in Bangkok (UTC+7), still 30 September in UTC.
          await stockVouchers(getContainer(), product, [{ code: "LISTS-DAY-0001-FFFF" }], {
            purchased_at: new Date("2026-09-30T17:30:00Z"),
          })

          const response = await get(`/admin/voucher-products/${product.voucherProductId}/batches`)

          expect(response.status).toBe(200)
          expect(response.data.batches).toEqual([
            expect.objectContaining({
              purchased_at: "2026-09-30T17:30:00.000Z",
              purchased_day: "2026-10-01",
            }),
          ])
        })

        it("reads batches a page at a time", async () => {
          const { product } = await twoBatches()

          const response = await get(
            `/admin/voucher-products/${product.voucherProductId}/batches?limit=1&offset=1`
          )

          expect(response.data.count).toBe(2)
          expect(response.data.batches.map((batch: { reference: string }) => batch.reference)).toEqual([
            "PO-0901",
          ])
        })
      })

      describe("Vouchers", () => {
        it("lists Vouchers soonest to expire first, open-ended last, with their days, status and hint", async () => {
          const { product } = await twoBatches()

          const response = await get(`/admin/voucher-products/${product.voucherProductId}/vouchers`)

          expect(response.status).toBe(200)
          expect(response.data.count).toBe(5)
          expect(
            response.data.vouchers.map((voucher: { code_hint: string; status: string }) => [
              voucher.code_hint,
              voucher.status,
            ])
          ).toEqual([
            ["BBBB", "expired"],
            ["DDDD", "under_minimum"],
            ["AAAA", "available"],
            ["EEEE", "available"],
            ["CCCC", "available"],
          ])
          const december = response.data.vouchers[3]
          expect(december).toEqual(
            expect.objectContaining({
              first_day: "2026-11-01",
              last_day: "2026-12-31",
              batch: expect.objectContaining({ reference: "PO-1001" }),
              order: null,
            })
          )
          expect(response.data.vouchers[4]).toEqual(
            expect.objectContaining({ first_day: null, last_day: null })
          )
          noSecrets(response.data)
        })

        it("shows the order an allocated Voucher went to", async () => {
          const product = await createVoucherProductVariant(getContainer(), "100")
          await stockVouchers(getContainer(), product, [
            { code: "LISTS-ALLOC-0001-FFFF", valid_until: inDays(30) },
            { code: "LISTS-ALLOC-0002-GGGG" },
          ])
          const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity: 1 }])
          await payOrderInFull(getContainer(), order.id, 100)
          await allocateVouchersForPaidOrderWorkflow(getContainer()).run({ input: { order_id: order.id } })

          const response = await get(`/admin/voucher-products/${product.voucherProductId}/vouchers`)

          expect(response.data.vouchers).toEqual([
            expect.objectContaining({
              code_hint: "FFFF",
              status: VoucherStatus.ALLOCATED,
              order: { id: order.id, display_id: order.display_id },
            }),
            expect.objectContaining({ code_hint: "GGGG", status: "available", order: null }),
          ])
        })

        it("names each Voucher's batch with its purchase day in the plugin's time zone", async () => {
          const product = await createVoucherProductVariant(getContainer(), "100")
          // 00:30 on 1 October in Bangkok (UTC+7), still 30 September in UTC. No reference.
          const [voucher] = await stockVouchers(getContainer(), product, [{ code: "LISTS-DAY-0002-HHHH" }], {
            purchased_at: new Date("2026-09-30T17:30:00Z"),
          })

          const response = await get(`/admin/voucher-products/${product.voucherProductId}/vouchers`)

          expect(response.status).toBe(200)
          expect(response.data.vouchers).toEqual([
            expect.objectContaining({
              batch: { id: voucher.batch_id, reference: null, purchased_day: "2026-10-01" },
            }),
          ])
        })

        it("filters by status, Expired and under minimum included, and by batch", async () => {
          const { product, september } = await twoBatches()
          const hints = async (query: string) =>
            (await get(`/admin/voucher-products/${product.voucherProductId}/vouchers?${query}`)).data.vouchers.map(
              (voucher: { code_hint: string }) => voucher.code_hint
            )

          expect(await hints("status=expired")).toEqual(["BBBB"])
          expect(await hints("status=under_minimum")).toEqual(["DDDD"])
          expect(await hints("status=available")).toEqual(["AAAA", "EEEE", "CCCC"])
          expect(await hints(`batch_id=${september[0].batch_id}`)).toEqual(["BBBB", "AAAA"])
        })

        it("reads 20 Vouchers a page by default and counts them all", async () => {
          const product = await createVoucherProductVariant(getContainer(), "100")
          await stockVouchers(
            getContainer(),
            product,
            Array.from({ length: 25 }, (_, index) => ({ code: `LISTS-MANY-${String(index).padStart(4, "0")}` }))
          )

          const first = await get(`/admin/voucher-products/${product.voucherProductId}/vouchers`)
          const second = await get(`/admin/voucher-products/${product.voucherProductId}/vouchers?offset=20`)

          expect(first.data.count).toBe(25)
          expect(first.data.vouchers).toHaveLength(20)
          expect(second.data.vouchers).toHaveLength(5)
        })
      })

      it("refuses an unknown Voucher product and a status it does not know", async () => {
        const { product } = await twoBatches()

        expect((await get("/admin/voucher-products/vprod_unknown/batches")).status).toBe(404)
        expect((await get("/admin/voucher-products/vprod_unknown/vouchers")).status).toBe(404)
        expect(
          (await get(`/admin/voucher-products/${product.voucherProductId}/vouchers?status=sold`)).status
        ).toBe(400)
      })
    })
  },
})
