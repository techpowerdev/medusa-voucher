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

        const voucher = await service.createVouchers({ code: "PLUGIN-LOADED" })

        expect(voucher.code).toBe("PLUGIN-LOADED")
      })
    })
  },
})
