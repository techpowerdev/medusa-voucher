import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { VOUCHER_MODULE } from ".."
import VoucherModuleService from "../service"
import Voucher from "../models/voucher"

jest.setTimeout(60 * 1000)

moduleIntegrationTestRunner<VoucherModuleService>({
  moduleName: VOUCHER_MODULE,
  moduleModels: [Voucher],
  resolve: "./src/modules/voucher",
  testSuite: ({ service }) => {
    describe("VoucherModuleService", () => {
      it("creates and retrieves a voucher", async () => {
        const created = await service.createVouchers({ code: "WELCOME10" })
        const retrieved = await service.retrieveVoucher(created.id)

        expect(retrieved.code).toBe("WELCOME10")
      })
    })
  },
})
