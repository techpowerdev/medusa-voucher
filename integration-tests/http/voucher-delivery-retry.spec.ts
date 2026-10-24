import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { LocalNotificationService } from "@medusajs/notification-local/dist/services/local"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import path from "path"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import { DeliveryChannel, DeliveryStatus } from "../../src/modules/voucher/constants"
import VoucherModuleService from "../../src/modules/voucher/service"
import { retryVoucherDeliveriesWorkflow } from "../../src/workflows/retry-voucher-deliveries"
import {
  createOrder,
  createVoucherProductVariant,
  payOrderInFull,
  stockVouchers,
} from "../helpers/vouchers"

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ getContainer }) => {
    describe("Retry and recovery of Deliveries", () => {
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)

      afterEach(() => jest.restoreAllMocks())

      // What the email provider was asked to send, as the local provider received it.
      const send = () => jest.spyOn(LocalNotificationService.prototype, "send")

      // The windows are measured from `now`, so a run "later" sees what was made just now.
      const retryAt = (msFromNow: number, page_size?: number) =>
        retryVoucherDeliveriesWorkflow(getContainer()).run({
          input: { now: new Date(Date.now() + msFromNow).toISOString(), page_size },
        })

      // A Paid order allocated through the module, so no event starts its Delivery.
      const allocatedOrder = async (title: string) => {
        const product = await createVoucherProductVariant(getContainer(), title)
        await stockVouchers(getContainer(), product, [{ code: `RETRY-${title}` }])
        const order = await createOrder(getContainer(), [{ variant_id: product.variantId, quantity: 1 }])
        const payment = await payOrderInFull(getContainer(), order.id, 100)
        await service().allocateVouchers({
          order_id: order.id,
          recipient_email: order.email,
          lines: order.items!.map((item) => ({
            order_line_item_id: item.id,
            variant_id: item.variant_id!,
            quantity: Number(item.quantity),
          })),
        })

        return { ...order, payment }
      }

      // Claims the order's email Delivery `claims` times, failing each claim but the last
      // unless `failLast`.
      const claimTimes = async (orderId: string, claims: number, failLast = true) => {
        for (let claim = 1; claim <= claims; claim++) {
          const delivery = await service().claimDelivery({
            order_id: orderId,
            channel: DeliveryChannel.EMAIL,
            recipient: "customer@example.test",
          })

          if (claim < claims || failLast) {
            await service().failDelivery({ id: delivery!.id, error: "SMTP 421 try again later" })
          }
        }
      }

      const deliveryOf = async (orderId: string) =>
        (await service().listVoucherDeliveries({ order_id: orderId }))[0]

      describe("a failed Delivery", () => {
        it("is sent again while it has fewer than 5 attempts", async () => {
          const order = await allocatedOrder("100")
          await claimTimes(order.id, 4)
          const sent = send()

          const { result } = await retryAt(MINUTE)

          expect(await deliveryOf(order.id)).toMatchObject({ status: DeliveryStatus.DELIVERED, attempts: 5 })
          expect(sent).toHaveBeenCalledTimes(1)
          expect(result.retried).toEqual([order.id])
        })

        it("stays failed for an operator once it has 5 attempts", async () => {
          const order = await allocatedOrder("100")
          await claimTimes(order.id, 5)
          const sent = send()

          await retryAt(MINUTE)

          expect(await deliveryOf(order.id)).toMatchObject({ status: DeliveryStatus.FAILED, attempts: 5 })
          expect(sent).not.toHaveBeenCalled()
        })

        it("is left alone when it was created more than 7 days ago", async () => {
          const order = await allocatedOrder("100")
          await claimTimes(order.id, 1)
          const sent = send()

          await retryAt(8 * DAY)

          expect(await deliveryOf(order.id)).toMatchObject({ status: DeliveryStatus.FAILED, attempts: 1 })
          expect(sent).not.toHaveBeenCalled()
        })
      })

      describe("a Delivery still sending", () => {
        it("is sent again after more than 10 minutes", async () => {
          const order = await allocatedOrder("100")
          await claimTimes(order.id, 1, false)
          const sent = send()

          await retryAt(11 * MINUTE)

          expect(await deliveryOf(order.id)).toMatchObject({ status: DeliveryStatus.DELIVERED, attempts: 2 })
          expect(sent).toHaveBeenCalledTimes(1)
        })

        it("is left alone for its first 10 minutes", async () => {
          const order = await allocatedOrder("100")
          await claimTimes(order.id, 1, false)
          const sent = send()

          await retryAt(5 * MINUTE)

          expect(await deliveryOf(order.id)).toMatchObject({ status: DeliveryStatus.SENDING, attempts: 1 })
          expect(sent).not.toHaveBeenCalled()
        })

        it("becomes failed without being sent when it was interrupted at its 5th attempt", async () => {
          const order = await allocatedOrder("100")
          await claimTimes(order.id, 5, false)
          const sent = send()

          await retryAt(11 * MINUTE)

          expect(await deliveryOf(order.id)).toMatchObject({
            status: DeliveryStatus.FAILED,
            attempts: 5,
            last_error: "Sending was interrupted",
          })
          expect(sent).not.toHaveBeenCalled()
        })
      })

      describe("an allocated order without an email Delivery", () => {
        it("gets one and is sent inside the window, and is logged as a warning", async () => {
          const order = await allocatedOrder("100")
          const sent = send()
          const warn = jest.spyOn(getContainer().resolve(ContainerRegistrationKeys.LOGGER), "warn")

          const { result } = await retryAt(11 * MINUTE)

          expect(await deliveryOf(order.id)).toMatchObject({ status: DeliveryStatus.DELIVERED, attempts: 1 })
          expect(sent).toHaveBeenCalledTimes(1)
          expect(result.recovered).toEqual([order.id])
          expect(warn.mock.calls.map(([message]) => message).join("\n")).toContain(order.id)
        })

        it("is left to its subscriber for the first 10 minutes", async () => {
          const order = await allocatedOrder("100")

          await retryAt(5 * MINUTE)

          expect(await service().listVoucherDeliveries({ order_id: order.id })).toEqual([])
        })

        it("is left alone when it was allocated more than 7 days ago", async () => {
          const order = await allocatedOrder("100")

          await retryAt(8 * DAY)

          expect(await service().listVoucherDeliveries({ order_id: order.id })).toEqual([])
        })

        it("works through the orders a page at a time without losing any", async () => {
          const first = await allocatedOrder("100")
          const second = await allocatedOrder("200")

          const { result } = await retryAt(11 * MINUTE, 1)

          expect(result.pages).toBe(2)
          expect([...result.recovered].sort()).toEqual([first.id, second.id].sort())
        })
      })

      describe("an order that is no longer a Paid order is not sent", () => {
        it("leaves the failed Delivery of a refunded order as it is", async () => {
          const order = await allocatedOrder("100")
          await claimTimes(order.id, 1)
          await getContainer()
            .resolve(Modules.PAYMENT)
            .refundPayment({ payment_id: order.payment.id, amount: 100 })
          const sent = send()

          await retryAt(MINUTE)

          expect(await deliveryOf(order.id)).toMatchObject({ status: DeliveryStatus.FAILED, attempts: 1 })
          expect(sent).not.toHaveBeenCalled()
        })

        it("leaves the failed Delivery of a canceled order as it is", async () => {
          const order = await allocatedOrder("100")
          await claimTimes(order.id, 1)
          await getContainer().resolve(Modules.ORDER).cancel(order.id)
          const sent = send()

          await retryAt(MINUTE)

          expect(await deliveryOf(order.id)).toMatchObject({ status: DeliveryStatus.FAILED, attempts: 1 })
          expect(sent).not.toHaveBeenCalled()
        })
      })

      it("logs an order that throws with its reason and goes on with the others", async () => {
        const broken = await allocatedOrder("100")
        const healthy = await allocatedOrder("200")
        await claimTimes(broken.id, 1)
        await claimTimes(healthy.id, 1)
        const [brokenAllocation] = await service().listVoucherAllocations({ order_id: broken.id })
        const reveal = service().revealVoucher.bind(service())
        jest.spyOn(service(), "revealVoucher").mockImplementation(async (id) => {
          if (id === brokenAllocation.voucher_id) {
            throw new Error("cannot decrypt")
          }

          return reveal(id)
        })
        const error = jest.spyOn(getContainer().resolve(ContainerRegistrationKeys.LOGGER), "error")

        const { result } = await retryAt(MINUTE)

        expect(await deliveryOf(healthy.id)).toMatchObject({ status: DeliveryStatus.DELIVERED })
        expect(result.failed).toEqual([broken.id])
        const logged = error.mock.calls.map(([message]) => message).join("\n")
        expect(logged).toContain(broken.id)
        expect(logged).toContain("cannot decrypt")
      })
    })
  },
})
