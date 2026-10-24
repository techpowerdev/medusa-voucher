import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import { DeliveryStatus } from "../../src/modules/voucher/constants"
import VoucherModuleService from "../../src/modules/voucher/service"
import { deliverOrderVouchersWorkflow } from "../../src/workflows/deliver-order-vouchers"
import { retryVoucherDeliveriesWorkflow } from "../../src/workflows/retry-voucher-deliveries"
import { createVoucherShippingOption, orderFulfillment } from "../helpers/fulfillment"
import {
  createOrder,
  createVoucherProductVariant,
  payOrderInFull,
  stockVouchers,
} from "../helpers/vouchers"

jest.setTimeout(60 * 1000)

// Read by the test application's configuration, which the runner loads in its beforeAll.
process.env.VOUCHER_TEST_DELIVERY_FULFILL = "false"

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ getContainer }) => {
    describe("Fulfillment turned off", () => {
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)

      afterAll(() => {
        delete process.env.VOUCHER_TEST_DELIVERY_FULFILL
        delete process.env.VOUCHER_TEST_SHIPPING_OPTION_ID
      })

      it("creates no fulfillment from the delivery workflow or the job", async () => {
        process.env.VOUCHER_TEST_SHIPPING_OPTION_ID = await createVoucherShippingOption(getContainer())
        const product = await createVoucherProductVariant(getContainer())
        await stockVouchers(getContainer(), product, [{ code: "NOFULFIL-0001" }])
        const order = await createOrder(getContainer(), [
          { variant_id: product.variantId, quantity: 1, requires_shipping: false },
        ])
        await payOrderInFull(getContainer(), order.id, 100)
        await service().allocateVouchers({
          order_id: order.id,
          recipient_email: order.email,
          lines: [{ order_line_item_id: order.items![0].id, variant_id: product.variantId, quantity: 1 }],
        })

        await deliverOrderVouchersWorkflow(getContainer()).run({ input: { order_id: order.id } })
        await retryVoucherDeliveriesWorkflow(getContainer()).run({
          input: { now: new Date(Date.now() + 60 * 1000).toISOString() },
        })

        expect(await service().listVoucherDeliveries({ order_id: order.id })).toEqual([
          expect.objectContaining({ status: DeliveryStatus.DELIVERED }),
        ])
        expect((await orderFulfillment(getContainer(), order.id)).fulfillments).toEqual([])
      })
    })
  },
})
