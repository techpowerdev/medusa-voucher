import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import { VoucherStatus } from "../../src/modules/voucher/constants"
import VoucherModuleService from "../../src/modules/voucher/service"
import { markExpiredVouchersWorkflow } from "../../src/workflows/mark-expired-vouchers"
import { createAdminHeaders } from "../helpers/admin"
import { createVoucherProductVariant, stockVouchers } from "../helpers/vouchers"

const DAY = 24 * 60 * 60 * 1000

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ api, getContainer }) => {
    describe("Marking Vouchers whose Validity period has ended as Expired", () => {
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)

      const inDays = (days: number) => new Date(Date.now() + days * DAY)
      const markExpired = async (now?: Date) =>
        (
          await markExpiredVouchersWorkflow(getContainer()).run({
            input: { now: now?.toISOString() },
          })
        ).result
      const statusOf = async (ids: string[]) => {
        const vouchers = await service().listVouchers({ id: ids })

        return Object.fromEntries(vouchers.map((voucher) => [voucher.id, voucher.status]))
      }

      it("marks an Available Voucher past its Validity period as Expired and leaves valid ones Available", async () => {
        const product = await createVoucherProductVariant(getContainer(), "100")
        const [ended, endsLater, openEnded] = await stockVouchers(getContainer(), product, [
          { code: "EXPIRY-ENDED-0001", valid_from: inDays(-30), valid_until: inDays(-1) },
          { code: "EXPIRY-LATER-0002", valid_until: inDays(1) },
          { code: "EXPIRY-OPEN-0003" },
        ])

        const result = await markExpired()

        expect(result).toEqual({ expired: 1 })
        expect(await statusOf([ended.id, endsLater.id, openEnded.id])).toEqual({
          [ended.id]: VoucherStatus.EXPIRED,
          [endsLater.id]: VoucherStatus.AVAILABLE,
          [openEnded.id]: VoucherStatus.AVAILABLE,
        })
      })

      it("marks as Expired a Voucher whose Validity period ends exactly at now", async () => {
        const product = await createVoucherProductVariant(getContainer(), "100")
        const now = inDays(2)
        const [atNow] = await stockVouchers(getContainer(), product, [
          { code: "EXPIRY-AT-NOW-0001", valid_until: now },
        ])

        expect(await markExpired(now)).toEqual({ expired: 1 })
        expect(await statusOf([atNow.id])).toEqual({ [atNow.id]: VoucherStatus.EXPIRED })
      })

      it("leaves Allocated, Delivered and Void Vouchers as they are, past their Validity period or not", async () => {
        const product = await createVoucherProductVariant(getContainer(), "100")
        const vouchers = await stockVouchers(getContainer(), product, [
          { code: "EXPIRY-ALLOC-0001", valid_from: inDays(-30), valid_until: inDays(-1) },
          { code: "EXPIRY-DELIV-0002", valid_from: inDays(-30), valid_until: inDays(-1) },
          { code: "EXPIRY-VOID-0003", valid_from: inDays(-30), valid_until: inDays(-1) },
        ])
        const statuses = [VoucherStatus.ALLOCATED, VoucherStatus.DELIVERED, VoucherStatus.VOID]
        await service().updateVouchers(
          vouchers.map((voucher, index) => ({ id: voucher.id, status: statuses[index] }))
        )

        expect(await markExpired()).toEqual({ expired: 0 })
        expect(await statusOf(vouchers.map((voucher) => voucher.id))).toEqual(
          Object.fromEntries(vouchers.map((voucher, index) => [voucher.id, statuses[index]]))
        )
      })

      it("changes nothing when run again", async () => {
        const product = await createVoucherProductVariant(getContainer(), "100")
        const [ended] = await stockVouchers(getContainer(), product, [
          { code: "EXPIRY-AGAIN-0001", valid_from: inDays(-30), valid_until: inDays(-1) },
        ])
        await markExpired()
        const before = (await service().listVouchers({ id: [ended.id] }))[0]

        expect(await markExpired()).toEqual({ expired: 0 })
        const after = (await service().listVouchers({ id: [ended.id] }))[0]
        expect(after.status).toBe(VoucherStatus.EXPIRED)
        expect(after.updated_at).toEqual(before.updated_at)
      })

      it("leaves the admin's counts and list as they were before the Vouchers were marked", async () => {
        const headers = await createAdminHeaders(getContainer())
        const product = await createVoucherProductVariant(getContainer(), "100")
        await stockVouchers(getContainer(), product, [
          { code: "EXPIRY-SEEN-0001-AAAA", valid_from: inDays(-30), valid_until: inDays(-1) },
          { code: "EXPIRY-SEEN-0002-BBBB", valid_until: inDays(30) },
        ])
        const read = async () => {
          const voucherProduct = await api.get(`/admin/voucher-products/${product.voucherProductId}`, headers)
          const vouchers = await api.get(`/admin/voucher-products/${product.voucherProductId}/vouchers`, headers)

          return {
            counts: voucherProduct.data.voucher_product.counts,
            vouchers: vouchers.data.vouchers.map((voucher: { code_hint: string; status: string }) => [
              voucher.code_hint,
              voucher.status,
            ]),
          }
        }
        const before = await read()

        await markExpired()

        expect(before.counts).toEqual(expect.objectContaining({ available: 1, expired: 1 }))
        expect(await read()).toEqual(before)
      })
    })
  },
})
