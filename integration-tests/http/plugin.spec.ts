import path from "path"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
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

        const voucher = await service.createVouchers({
          code_encrypted: "encrypted",
          code_hash: "hash",
          code_hint: "00",
          variant_id: "variant_100",
          batch_id: batch.id,
        })

        expect(voucher.status).toBe("available")
      })
    })
  },
})
