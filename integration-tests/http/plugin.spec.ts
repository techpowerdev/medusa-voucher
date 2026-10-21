import path from "path"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { VoucherStatus } from "../../src/modules/voucher/constants"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import VoucherModuleService from "../../src/modules/voucher/service"

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ getContainer }) => {
    describe("@khumkha/medusa-voucher", () => {
      it("registers the voucher module in the host app", async () => {
        const service: VoucherModuleService =
          getContainer().resolve(VOUCHER_MODULE)

        const batch = await service.createVoucherBatches({
          partner: "Example Partner",
          variant_id: "variant_100",
          face_value: 100,
          currency_code: "thb",
          purchased_at: new Date(),
        })

        const [voucher] = await service.createVouchersFromCodes({
          batch_id: batch.id,
          vouchers: [{ code: "HOST-APP-CODE-0001", pin: "1234" }],
        })

        expect(voucher.status).toBe(VoucherStatus.AVAILABLE)
        expect(voucher.code_encrypted).not.toContain("HOST-APP")
        expect(await service.revealVoucher(voucher.id)).toEqual({
          code: "HOST-APP-CODE-0001",
          pin: "1234",
        })
      })
    })
  },
})
