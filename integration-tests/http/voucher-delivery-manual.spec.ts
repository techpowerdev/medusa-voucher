import { LocalNotificationService } from "@medusajs/notification-local/dist/services/local"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import VoucherModuleService from "../../src/modules/voucher/service"
import { allocateVouchersForPaidOrderWorkflow } from "../../src/workflows/allocate-vouchers-for-paid-order"
import {
  createOrder,
  createVoucherProductVariant,
  payOrderInFull,
  stockVouchers,
} from "../helpers/vouchers"

jest.setTimeout(60 * 1000)

// Read by the test application's configuration, which the runner loads in its beforeAll.
process.env.VOUCHER_TEST_DELIVERY_AUTOMATIC = "false"

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ getContainer }) => {
    describe("Automatic delivery turned off", () => {
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)

      afterAll(() => {
        delete process.env.VOUCHER_TEST_DELIVERY_AUTOMATIC
      })

      afterEach(() => jest.restoreAllMocks())

      it("sends nothing and creates no Delivery after an allocation", async () => {
        const send = jest.spyOn(LocalNotificationService.prototype, "send")
        const product = await createVoucherProductVariant(getContainer())
        await stockVouchers(getContainer(), product, [{ code: "MANUAL-0001" }])
        const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity: 1 }])
        await payOrderInFull(getContainer(), order.id, 100)

        const { result } = await allocateVouchersForPaidOrderWorkflow(getContainer()).run({
          input: { order_id: order.id },
        })
        // Give the event time to reach the subscriber; with automatic delivery on, this
        // order is delivered well within it.
        await new Promise((resolve) => setTimeout(resolve, 3000))

        expect(result?.allocated).toHaveLength(1)
        expect(await service().listVoucherDeliveries({ order_id: order.id })).toEqual([])
        expect(send).not.toHaveBeenCalled()
      })
    })
  },
})
