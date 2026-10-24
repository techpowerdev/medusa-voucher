import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { LocalNotificationService } from "@medusajs/notification-local/dist/services/local"
import {
  createApiKeysWorkflow,
  createOrderFulfillmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import { DeliveryChannel, DeliveryStatus } from "../../src/modules/voucher/constants"
import VoucherModuleService from "../../src/modules/voucher/service"
import { createVoucherProductWorkflow } from "../../src/workflows/create-voucher-product"
import { deliverOrderVouchersWorkflow } from "../../src/workflows/deliver-order-vouchers"
import { retryVoucherDeliveriesWorkflow } from "../../src/workflows/retry-voucher-deliveries"
import { createVariant } from "../helpers/admin"
import { createVoucherShippingOption, orderFulfillment } from "../helpers/fulfillment"
import {
  createOrder,
  createVoucherProductVariant,
  OrderLine,
  payOrderInFull,
  stockVouchers,
} from "../helpers/vouchers"

const MINUTE = 60 * 1000

jest.setTimeout(90 * 1000)

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ api, getContainer }) => {
    describe("Fulfillment of an order's Voucher lines after its Delivery", () => {
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)

      // The plugin reads the shipping option through a getter on every fulfillment.
      const useShippingOption = async () => {
        const id = await createVoucherShippingOption(getContainer())
        process.env.VOUCHER_TEST_SHIPPING_OPTION_ID = id

        return id
      }

      afterEach(() => {
        delete process.env.VOUCHER_TEST_SHIPPING_OPTION_ID
        jest.restoreAllMocks()
      })

      const send = () => jest.spyOn(LocalNotificationService.prototype, "send")
      const logged = (level: "error" | "warn") =>
        jest.spyOn(getContainer().resolve(ContainerRegistrationKeys.LOGGER), level)
      const deliver = (orderId: string) =>
        deliverOrderVouchersWorkflow(getContainer()).run({ input: { order_id: orderId } })
      const retry = () =>
        retryVoucherDeliveriesWorkflow(getContainer()).run({
          input: { now: new Date(Date.now() + MINUTE).toISOString() },
        })

      // Allocates the lines of `voucherVariantId` through the module, so no event starts a
      // Delivery on its own.
      const allocate = async (
        order: { id: string; email?: string | null; items?: any[] | null },
        voucherVariantId: string
      ) =>
        service().allocateVouchers({
          order_id: order.id,
          recipient_email: order.email ?? null,
          lines: order.items!.filter((item) => item.variant_id === voucherVariantId).map((item) => ({
            order_line_item_id: item.id,
            variant_id: item.variant_id!,
            quantity: Number(item.quantity),
          })),
        })

      // A Paid order of `quantity` Vouchers (not requiring shipping) plus `extra` lines,
      // allocated but not yet delivered.
      const paidVoucherOrder = async (quantity = 2, extra: OrderLine[] = []) => {
        const product = await createVoucherProductVariant(getContainer(), "100")
        await stockVouchers(
          getContainer(),
          product,
          Array.from({ length: quantity }, (_, index) => ({ code: `FULFIL-${index + 1}` }))
        )
        const order = await createOrder(getContainer(), [
          { variant_id: product.variantId, quantity, requires_shipping: false },
          ...extra,
        ])
        const total = [{ quantity }, ...extra].reduce((sum, line) => sum + line.quantity * 100, 0)
        const payment = await payOrderInFull(getContainer(), order.id, total)
        await allocate(order, product.variantId)
        const voucherLineId = order.items!.find((item) => item.variant_id === product.variantId)!.id

        return { ...order, payment, voucherLineId }
      }

      it("ends a Vouchers-only order delivered, each Voucher line fully fulfilled and delivered", async () => {
        await useShippingOption()
        const order = await paidVoucherOrder(2)

        await deliver(order.id)

        const fulfillment = await orderFulfillment(getContainer(), order.id)
        expect(fulfillment.status).toBe("delivered")
        expect(fulfillment.lines[order.voucherLineId]).toEqual({ fulfilled: 2, delivered: 2 })
        expect(fulfillment.fulfillments).toEqual([expect.objectContaining({ delivered: true })])
      })

      it("fulfills only the Voucher lines of a mixed order", async () => {
        await useShippingOption()
        const shirt = await createVariant(getContainer(), "T-shirt")
        const order = await paidVoucherOrder(1, [{ variant_id: shirt, quantity: 1 }])
        const shirtLineId = order.items!.find((item) => item.variant_id === shirt)!.id

        await deliver(order.id)

        const fulfillment = await orderFulfillment(getContainer(), order.id)
        expect(fulfillment.status).toBe("partially_delivered")
        expect(fulfillment.lines[order.voucherLineId]).toEqual({ fulfilled: 1, delivered: 1 })
        expect(fulfillment.lines[shirtLineId]).toEqual({ fulfilled: 0, delivered: 0 })
      })

      it("creates no fulfillment when the Delivery fails", async () => {
        await useShippingOption()
        jest
          .spyOn(LocalNotificationService.prototype, "send")
          .mockRejectedValue(new Error("SMTP 421 try again later"))
        const order = await paidVoucherOrder(1)

        await deliver(order.id)

        const fulfillment = await orderFulfillment(getContainer(), order.id)
        expect(fulfillment.status).toBe("not_fulfilled")
        expect(fulfillment.fulfillments).toEqual([])
      })

      it("logs a fulfillment that cannot be made, keeps the Delivery and lets the job fulfill it later", async () => {
        const sent = send()
        const error = logged("error")
        const order = await paidVoucherOrder(1)

        await deliver(order.id)

        const [delivery] = await service().listVoucherDeliveries({ order_id: order.id })
        expect(delivery).toMatchObject({ status: DeliveryStatus.DELIVERED, attempts: 1 })
        expect(error.mock.calls.map(([message]) => message).join("\n")).toContain(order.id)
        expect((await orderFulfillment(getContainer(), order.id)).fulfillments).toEqual([])

        await useShippingOption()
        const { result } = await retry()

        expect(result.fulfilled).toEqual([order.id])
        expect((await orderFulfillment(getContainer(), order.id)).status).toBe("delivered")
        expect(sent).toHaveBeenCalledTimes(1)
      })

      it("creates no second fulfillment when delivery or the job runs again", async () => {
        await useShippingOption()
        const order = await paidVoucherOrder(2)
        await deliver(order.id)

        await deliver(order.id)
        await retry()

        const fulfillment = await orderFulfillment(getContainer(), order.id)
        expect(fulfillment.fulfillments).toHaveLength(1)
        expect(fulfillment.lines[order.voucherLineId]).toEqual({ fulfilled: 2, delivered: 2 })
      })

      it("marks delivered a fulfillment that was made but not delivered, without making another", async () => {
        const order = await paidVoucherOrder(1)
        await deliver(order.id)
        const shippingOptionId = await useShippingOption()
        await createOrderFulfillmentWorkflow(getContainer()).run({
          input: {
            order_id: order.id,
            items: [{ id: order.voucherLineId, quantity: 1 }],
            shipping_option_id: shippingOptionId,
          },
        })

        await retry()

        const fulfillment = await orderFulfillment(getContainer(), order.id)
        expect(fulfillment.status).toBe("delivered")
        expect(fulfillment.fulfillments).toEqual([expect.objectContaining({ delivered: true })])
      })

      it("creates the fulfillment and marks it delivered with no_notification", async () => {
        await useShippingOption()
        const order = await paidVoucherOrder(1)
        const emit = jest.spyOn(getContainer().resolve(Modules.EVENT_BUS), "emit")

        await deliver(order.id)

        const messages = emit.mock.calls.flatMap(([batch]) => (Array.isArray(batch) ? batch : [batch]))
        const created = messages.filter((message) => message.name === "order.fulfillment_created")
        const delivered = messages.filter((message) => message.name === "delivery.created")
        expect(created).toEqual([expect.objectContaining({ data: expect.objectContaining({ no_notification: true }) })])
        expect(delivered).toEqual([expect.objectContaining({ data: expect.objectContaining({ no_notification: true }) })])
      })

      it("logs a warning, not an error, when another run fulfilled the order first", async () => {
        const shippingOptionId = await useShippingOption()
        const order = await paidVoucherOrder(1)
        const warn = logged("warn")
        const error = logged("error")
        // Another run (the job meeting a live delivery) fulfills the order after this run has
        // read what is left and before it creates the fulfillment. The plugin reads its
        // settings first to check `fulfill`, then again for the shipping option just before
        // creating, so the competitor runs on the second read after the Delivery succeeded.
        const settings = service().getDeliverySettings.bind(service())
        let readsAfterDelivery = 0
        jest.spyOn(service(), "getDeliverySettings").mockImplementation(async () => {
          const [delivery] = await service().listVoucherDeliveries({ order_id: order.id })

          if (delivery?.status === DeliveryStatus.DELIVERED && ++readsAfterDelivery === 2) {
            const { result: fulfillment } = await createOrderFulfillmentWorkflow(getContainer()).run({
              input: {
                order_id: order.id,
                items: [{ id: order.voucherLineId, quantity: 1 }],
                shipping_option_id: shippingOptionId,
              },
            })
            await markOrderFulfillmentAsDeliveredWorkflow(getContainer()).run({
              input: { orderId: order.id, fulfillmentId: fulfillment.id },
            })
          }

          return settings()
        })

        await deliver(order.id)

        expect(readsAfterDelivery).toBeGreaterThanOrEqual(2)
        expect(warn.mock.calls.map(([message]) => message).join("\n")).toContain(order.id)
        expect(error.mock.calls.map(([message]) => message).join("\n")).not.toContain(order.id)
        const fulfillment = await orderFulfillment(getContainer(), order.id)
        expect(fulfillment.status).toBe("delivered")
        expect(fulfillment.fulfillments).toHaveLength(1)
      })

      it("skips without logging a canceled order whose fulfillment failed", async () => {
        const order = await paidVoucherOrder(1)
        await deliver(order.id)
        await getContainer().resolve(Modules.ORDER).cancel(order.id)
        await useShippingOption()
        const error = logged("error")

        const { result } = await retry()

        expect(result.fulfilled).toEqual([])
        expect(result.failed).toEqual([])
        expect(error.mock.calls.map(([message]) => message).join("\n")).not.toContain(order.id)
        expect((await orderFulfillment(getContainer(), order.id)).fulfillments).toEqual([])
      })

      it("completes a cart of Vouchers without a shipping method and fulfills its order", async () => {
        await useShippingOption()
        const container = getContainer()
        const {
          result: [region],
        } = await createRegionsWorkflow(container).run({
          input: {
            regions: [
              { name: "Thailand", currency_code: "thb", countries: ["th"], payment_providers: ["pp_system_default"] },
            ],
          },
        })
        const {
          result: [salesChannel],
        } = await createSalesChannelsWorkflow(container).run({
          input: { salesChannelsData: [{ name: "Web" }] },
        })
        const {
          result: [apiKey],
        } = await createApiKeysWorkflow(container).run({
          input: { api_keys: [{ title: "Storefront", type: "publishable", created_by: "test" }] },
        })
        await linkSalesChannelsToApiKeyWorkflow(container).run({
          input: { id: apiKey.id, add: [salesChannel.id] },
        })
        // As the README recommends: no shipping profile and no inventory management.
        const {
          result: [product],
        } = await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: "Gift voucher",
                status: "published",
                options: [{ title: "Face value", values: ["500"] }],
                variants: [
                  {
                    title: "500",
                    options: { "Face value": "500" },
                    manage_inventory: false,
                    prices: [{ currency_code: "thb", amount: 500 }],
                  },
                ],
                sales_channels: [{ id: salesChannel.id }],
              },
            ],
          },
        })
        const variantId = product.variants[0].id
        const { result: voucherProduct } = await createVoucherProductWorkflow(container).run({
          input: { variant_id: variantId, face_value: 500, currency_code: "thb" },
        })
        await stockVouchers(container, { variantId, voucherProductId: voucherProduct.id }, [
          { code: "CART-0001" },
        ])
        // A rejected request shows the store API's reason instead of only its status.
        const post = (url: string, body: object) =>
          api
            .post(url, body, { headers: { "x-publishable-api-key": apiKey.token } })
            .catch((error: any) => {
              throw new Error(`POST ${url}: ${JSON.stringify(error.response?.data)}`)
            })

        const {
          data: { cart },
        } = await post("/store/carts", {
          region_id: region.id,
          sales_channel_id: salesChannel.id,
          email: "customer@example.test",
          items: [{ variant_id: variantId, quantity: 1 }],
        })
        const {
          data: { payment_collection },
        } = await post("/store/payment-collections", { cart_id: cart.id })
        await post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, {
          provider_id: "pp_system_default",
        })
        const { data: completed } = await post(`/store/carts/${cart.id}/complete`, {})

        expect(completed.type).toBe("order")
        const { data: orders } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
          entity: "order",
          fields: ["id", "email", "items.*", "shipping_methods.id", "payment_collections.payments.id"],
          filters: { id: completed.order.id },
        })
        const order = orders[0]
        expect(order.shipping_methods).toEqual([])
        await container.resolve(Modules.PAYMENT).capturePayment({
          payment_id: order.payment_collections![0]!.payments![0]!.id,
          amount: 500,
        })
        await allocate(order as any, variantId)

        await deliver(order.id)

        const fulfillment = await orderFulfillment(container, order.id)
        expect(fulfillment.status).toBe("delivered")
        expect(
          (await service().listVoucherDeliveries({ order_id: order.id, channel: DeliveryChannel.EMAIL }))[0]
        ).toMatchObject({ status: DeliveryStatus.DELIVERED })
      })
    })
  },
})
