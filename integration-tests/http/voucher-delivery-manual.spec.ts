import { LocalNotificationService } from "@medusajs/notification-local/dist/services/local"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import { DeliveryChannel, DeliveryStatus } from "../../src/modules/voucher/constants"
import VoucherModuleService from "../../src/modules/voucher/service"
import { allocateVouchersForPaidOrderWorkflow } from "../../src/workflows/allocate-vouchers-for-paid-order"
import { retryVoucherDeliveriesWorkflow } from "../../src/workflows/retry-voucher-deliveries"
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

      it("retries and recovers nothing", async () => {
        const send = jest.spyOn(LocalNotificationService.prototype, "send")
        const allocatedOrder = async (title: string) => {
          const product = await createVoucherProductVariant(getContainer(), title)
          await stockVouchers(getContainer(), product, [{ code: `MANUAL-${title}` }])
          const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity: 1 }])
          await payOrderInFull(getContainer(), order.id, 100)
          await allocateVouchersForPaidOrderWorkflow(getContainer()).run({ input: { order_id: order.id } })

          return order
        }
        const withoutDelivery = await allocatedOrder("100")
        const withFailedDelivery = await allocatedOrder("200")
        const delivery = await service().claimDelivery({
          order_id: withFailedDelivery.id,
          channel: DeliveryChannel.EMAIL,
          recipient: "customer@example.test",
        })
        await service().failDelivery({ id: delivery!.id, error: "SMTP 421 try again later" })

        await retryVoucherDeliveriesWorkflow(getContainer()).run({
          input: { now: new Date(Date.now() + 11 * 60 * 1000).toISOString() },
        })

        expect(send).not.toHaveBeenCalled()
        expect(await service().listVoucherDeliveries({ order_id: withoutDelivery.id })).toEqual([])
        expect(await service().listVoucherDeliveries({ order_id: withFailedDelivery.id })).toEqual([
          expect.objectContaining({ status: DeliveryStatus.FAILED, attempts: 1 }),
        ])
      })
    })
  },
})
