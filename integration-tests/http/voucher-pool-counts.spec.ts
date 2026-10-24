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

// Allocations here only check which Vouchers can be taken. Read by the test application's
// configuration in the runner's beforeAll.
process.env.VOUCHER_TEST_DELIVERY_AUTOMATIC = "false"

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ api, getContainer }) => {
    describe("A Voucher product's Pool counted by status (admin API)", () => {
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)
      let headers: Awaited<ReturnType<typeof createAdminHeaders>>

      beforeEach(async () => {
        headers = await createAdminHeaders(getContainer())
      })

      afterAll(() => {
        delete process.env.VOUCHER_TEST_DELIVERY_AUTOMATIC
      })

      const inDays = (days: number) => new Date(Date.now() + days * DAY)

      // The test application requires 7 days of validity left. Three Vouchers can be sold;
      // the others are past their Validity period, too close to its end, or no longer Available.
      const stockedPool = async () => {
        const product = await createVoucherProductVariant(getContainer(), "100")
        const vouchers = await stockVouchers(getContainer(), product, [
          { code: "POOL-OPEN-ENDED" },
          { code: "POOL-30-DAYS", valid_until: inDays(30) },
          { code: "POOL-NOT-YET-VALID", valid_from: inDays(10), valid_until: inDays(40) },
          { code: "POOL-EXPIRED", valid_from: inDays(-30), valid_until: inDays(-1) },
          { code: "POOL-3-DAYS-LEFT", valid_until: inDays(3) },
          { code: "POOL-ALLOCATED" },
          { code: "POOL-DELIVERED" },
          { code: "POOL-VOID" },
        ])
        const statuses = [VoucherStatus.ALLOCATED, VoucherStatus.DELIVERED, VoucherStatus.VOID]
        await service().updateVouchers(
          vouchers.slice(5).map((voucher, index) => ({ id: voucher.id, status: statuses[index] }))
        )

        return product
      }

      const expectedCounts = {
        available: 3,
        expired: 1,
        under_minimum: 1,
        allocated: 1,
        delivered: 1,
        void: 1,
      }

      it("counts a Voucher product's Pool, keeping expired and under-minimum Vouchers apart from Available", async () => {
        const product = await stockedPool()

        const response = await api.get(`/admin/voucher-products/${product.voucherProductId}`, headers)

        expect(response.status).toBe(200)
        expect(response.data.voucher_product).toEqual(
          expect.objectContaining({
            id: product.voucherProductId,
            face_value: 100,
            currency_code: "thb",
            product_variant: expect.objectContaining({
              id: product.variantId,
              title: "100",
              product: expect.objectContaining({ title: "Example voucher 100" }),
            }),
            counts: expectedCounts,
          })
        )
        expect(JSON.stringify(response.data)).not.toMatch(/POOL-|code_hash|code_encrypted|pin_encrypted/)
      })

      it("lists Voucher products with only sellable Vouchers as available_vouchers, and their counts", async () => {
        const product = await stockedPool()

        const response = await api.get("/admin/voucher-products", headers)

        const listed = response.data.voucher_products.find(
          (voucherProduct: { id: string }) => voucherProduct.id === product.voucherProductId
        )
        expect(listed.available_vouchers).toBe(3)
        expect(listed.counts).toEqual(expectedCounts)
        expect(JSON.stringify(response.data)).not.toMatch(/POOL-|code_hash|code_encrypted|pin_encrypted/)
      })

      it("counts as Available exactly what an allocation can take", async () => {
        const product = await stockedPool()
        const allocate = async (quantity: number) => {
          const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity }])
          await payOrderInFull(getContainer(), order.id, quantity * 100)
          const { result } = await allocateVouchersForPaidOrderWorkflow(getContainer()).run({
            input: { order_id: order.id },
          })

          return result
        }

        const tooMany = await allocate(expectedCounts.available + 1)
        const exactly = await allocate(expectedCounts.available)

        expect(tooMany?.allocated).toEqual([])
        expect(tooMany?.failures).toEqual([
          expect.objectContaining({ requested: 4, available: expectedCounts.available }),
        ])
        expect(exactly?.allocated).toHaveLength(expectedCounts.available)
      })

      it("refuses an unknown Voucher product", async () => {
        const response = await api
          .get("/admin/voucher-products/vprod_unknown", headers)
          .catch((error) => error.response)

        expect(response.status).toBe(404)
      })
    })
  },
})
