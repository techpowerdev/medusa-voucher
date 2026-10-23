import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { LocalNotificationService } from "@medusajs/notification-local/dist/services/local"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import jsQR from "jsqr"
import path from "path"
import { PNG } from "pngjs"
import { VOUCHER_MODULE } from "../../src/modules/voucher"
import { DeliveryChannel, DeliveryStatus, VoucherStatus } from "../../src/modules/voucher/constants"
import VoucherModuleService from "../../src/modules/voucher/service"
import { VoucherCodeInput } from "../../src/modules/voucher/types"
import { allocateVouchersForPaidOrderWorkflow } from "../../src/workflows/allocate-vouchers-for-paid-order"
import { deliverOrderVouchersWorkflow } from "../../src/workflows/deliver-order-vouchers"
import { createVariant } from "../helpers/admin"
import { testEmailRenderer } from "../helpers/email-renderer"
import {
  createOrder,
  createVoucherProductVariant,
  payOrderInFull,
  stockVouchers,
} from "../helpers/vouchers"

jest.setTimeout(60 * 1000)

// What a base64 PNG QR code says when scanned.
function scanQrCode(base64: string): string | undefined {
  const png = PNG.sync.read(Buffer.from(base64, "base64"))

  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data
}

medusaIntegrationTestRunner({
  medusaConfigFile: path.join(__dirname, ".."),
  testSuite: ({ getContainer }) => {
    describe("Delivery of an order's Vouchers by email", () => {
      const service = (): VoucherModuleService => getContainer().resolve(VOUCHER_MODULE)
      const orderVoucherStatuses = async (orderId: string) => {
        const allocations = await service().listVoucherAllocations(
          { order_id: orderId },
          { relations: ["voucher"] }
        )

        return allocations.map((allocation) => allocation.voucher.status)
      }

      // What the email provider was asked to send, as the local provider received it.
      const send = () => jest.spyOn(LocalNotificationService.prototype, "send")

      afterEach(() => jest.restoreAllMocks())

      const deliver = (orderId: string) =>
        deliverOrderVouchersWorkflow(getContainer()).run({ input: { order_id: orderId } })

      // A Paid order with one line per Voucher product, allocated as the subscriber would.
      const allocatedOrder = async (
        lines: {
          title: string
          quantity: number
          vouchers: VoucherCodeInput[]
          redemption_instructions?: string
        }[],
        orderFields: { email?: string | null } = {}
      ) => {
        const orderLines: { variant_id: string; quantity: number }[] = []

        for (const line of lines) {
          const product = await createVoucherProductVariant(getContainer(), line.title)
          await stockVouchers(getContainer(), product, line.vouchers, {
            redemption_instructions: line.redemption_instructions,
          })
          orderLines.push({ variant_id: product.variantId, quantity: line.quantity })
        }

        const order = await createOrder(getContainer(), orderLines, orderFields)
        const total = orderLines.reduce((sum, line) => sum + line.quantity * 100, 0)
        const payment = await payOrderInFull(getContainer(), order.id, total)
        await allocateVouchersForPaidOrderWorkflow(getContainer()).run({
          input: { order_id: order.id },
        })

        return { ...order, payment, total }
      }

      it("sends one message with every first-time Allocation of the order and its number", async () => {
        const sent = send()
        const order = await allocatedOrder([
          { title: "100", quantity: 2, vouchers: [{ code: "COFFEE-0001" }, { code: "COFFEE-0002" }] },
          { title: "500", quantity: 1, vouchers: [{ code: "MART-0001" }] },
        ])

        await deliver(order.id)

        expect(sent).toHaveBeenCalledTimes(1)
        const message = sent.mock.calls[0][0]
        expect(message).toMatchObject({ to: "customer@example.test", channel: "email" })
        for (const code of ["COFFEE-0001", "COFFEE-0002", "MART-0001"]) {
          expect(message.content?.text).toContain(code)
          expect(message.content?.html).toContain(code)
        }
        expect(message.content?.subject).toContain(`#${order.display_id}`)
      })

      it("shows each Voucher's Partner, Face value, usable days and Redemption instructions", async () => {
        const sent = send()
        // Whole days in the store's timezone (Asia/Bangkok, UTC+7): usable from 1 November
        // 2026 up to, not including, 1 January 2027, so the last day is 31 December.
        const order = await allocatedOrder([
          {
            title: "100",
            quantity: 1,
            vouchers: [
              {
                code: "COFFEE-0001",
                valid_from: new Date("2026-10-31T17:00:00Z"),
                valid_until: new Date("2026-12-31T17:00:00Z"),
              },
            ],
            redemption_instructions: "Show the code at the counter",
          },
        ])

        await deliver(order.id)

        const { text, html } = sent.mock.calls[0][0].content ?? {}
        for (const body of [text, html]) {
          expect(body).toContain("Example voucher 100")
          expect(body).toContain("100 THB")
          expect(body).toContain("2026-11-01")
          expect(body).toContain("2026-12-31")
          expect(body).toContain("Show the code at the counter")
        }
      })

      it("shows the PIN only for a Voucher that has one", async () => {
        const sent = send()
        const order = await allocatedOrder([
          {
            title: "100",
            quantity: 2,
            vouchers: [{ code: "COFFEE-0001", pin: "4321" }, { code: "COFFEE-0002" }],
          },
        ])

        await deliver(order.id)

        const { text, html } = sent.mock.calls[0][0].content ?? {}
        for (const body of [text, html]) {
          expect(body).toContain("4321")
          expect(body?.match(/PIN/g)).toHaveLength(1)
        }
      })

      it("attaches a QR code of each code alone as an inline image the HTML refers to", async () => {
        const sent = send()
        const order = await allocatedOrder([
          {
            title: "100",
            quantity: 2,
            vouchers: [{ code: "COFFEE-0001", pin: "4321" }, { code: "COFFEE-0002" }],
          },
        ])

        await deliver(order.id)

        const { content, attachments } = sent.mock.calls[0][0]
        expect(attachments).toHaveLength(2)
        for (const attachment of attachments ?? []) {
          expect(attachment).toMatchObject({ content_type: "image/png", disposition: "inline" })
          expect(attachment.id).toBeTruthy()
          expect(content?.html).toContain(`cid:${attachment.id}`)
        }
        expect(content?.html).not.toContain("data:")
        expect((attachments ?? []).map((a) => scanQrCode(a.content)).sort()).toEqual([
          "COFFEE-0001",
          "COFFEE-0002",
        ])
      })

      it("records the Delivery as delivered and the order's Vouchers as Delivered", async () => {
        const order = await allocatedOrder([
          { title: "100", quantity: 2, vouchers: [{ code: "COFFEE-0001" }, { code: "COFFEE-0002" }] },
        ])

        await deliver(order.id)

        const [delivery] = await service().listVoucherDeliveries({ order_id: order.id })
        expect(delivery).toMatchObject({
          channel: DeliveryChannel.EMAIL,
          recipient: "customer@example.test",
          status: DeliveryStatus.DELIVERED,
          attempts: 1,
          last_error: null,
        })
        expect(delivery.delivered_at).toBeTruthy()
        expect(await orderVoucherStatuses(order.id)).toEqual([
          VoucherStatus.DELIVERED,
          VoucherStatus.DELIVERED,
        ])

        // A later attempt must not be skipped by Medusa as a duplicate of this one.
        const notifications = await getContainer()
          .resolve(Modules.NOTIFICATION)
          .listNotifications({ resource_id: order.id })
        // The model stores the key, but Medusa's NotificationDTO type does not declare it.
        const keys = notifications.map((n) => (n as { idempotency_key?: string | null }).idempotency_key)
        expect(keys).toEqual([`${delivery.id}:1`])
      })

      it("records a failed Delivery and sends nothing when the order has no email", async () => {
        const sent = send()
        const order = await allocatedOrder(
          [{ title: "100", quantity: 1, vouchers: [{ code: "COFFEE-0001" }] }],
          { email: null }
        )

        await deliver(order.id)

        expect(sent).not.toHaveBeenCalled()
        const [delivery] = await service().listVoucherDeliveries({ order_id: order.id })
        expect(delivery).toMatchObject({
          status: DeliveryStatus.FAILED,
          attempts: 1,
          recipient: null,
          delivered_at: null,
        })
        expect(delivery.last_error).toMatch(/no email/i)
        expect(await orderVoucherStatuses(order.id)).toEqual([VoucherStatus.ALLOCATED])
      })

      it("records a failed Delivery without codes when the provider throws", async () => {
        send().mockRejectedValue(
          new Error("550 message rejected: content COFFEE-0001 PIN 4321 looked like spam")
        )
        const logged = jest.spyOn(getContainer().resolve(ContainerRegistrationKeys.LOGGER), "error")
        const order = await allocatedOrder([
          { title: "100", quantity: 1, vouchers: [{ code: "COFFEE-0001", pin: "4321" }] },
        ])

        await deliver(order.id)

        const [delivery] = await service().listVoucherDeliveries({ order_id: order.id })
        expect(delivery).toMatchObject({ status: DeliveryStatus.FAILED, attempts: 1, delivered_at: null })
        expect(delivery.last_error).toMatch(/failed to send notification/i)
        expect(await orderVoucherStatuses(order.id)).toEqual([VoucherStatus.ALLOCATED])

        // The provider's own reason is logged for the operator, without the order's secrets.
        const logs = logged.mock.calls.map((call) => String(call[0])).join("\n")
        expect(logs).toContain("550 message rejected")
        for (const secret of ["COFFEE-0001", "4321"]) {
          expect(delivery.last_error).not.toContain(secret)
          expect(logs).not.toContain(secret)
        }
      })

      it("sends one message when two runs deliver the same order at once", async () => {
        // A slow provider keeps the first run sending while the second one tries.
        const sent = send().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 500))
          return {}
        })
        const order = await allocatedOrder([
          { title: "100", quantity: 1, vouchers: [{ code: "COFFEE-0001" }] },
        ])

        await Promise.all([deliver(order.id), deliver(order.id)])

        expect(sent).toHaveBeenCalledTimes(1)
        const deliveries = await service().listVoucherDeliveries({ order_id: order.id })
        expect(deliveries).toHaveLength(1)
        expect(deliveries[0]).toMatchObject({ status: DeliveryStatus.DELIVERED, attempts: 1 })
      })

      describe("an order that is no longer a Paid order is not sent", () => {
        it("sends nothing for an order canceled after its allocation", async () => {
          const sent = send()
          const order = await allocatedOrder([
            { title: "100", quantity: 1, vouchers: [{ code: "COFFEE-0001" }] },
          ])
          await getContainer().resolve(Modules.ORDER).cancel(order.id)

          await deliver(order.id)

          expect(sent).not.toHaveBeenCalled()
          expect(await service().listVoucherDeliveries({ order_id: order.id })).toEqual([])
        })

        it("sends nothing for an order refunded after its allocation", async () => {
          const sent = send()
          const order = await allocatedOrder([
            { title: "100", quantity: 1, vouchers: [{ code: "COFFEE-0001" }] },
          ])
          await getContainer()
            .resolve(Modules.PAYMENT)
            .refundPayment({ payment_id: order.payment.id, amount: order.total })

          await deliver(order.id)

          expect(sent).not.toHaveBeenCalled()
          expect(await service().listVoucherDeliveries({ order_id: order.id })).toEqual([])
        })
      })

      it("sends nothing and records no Delivery for a Paid order without Vouchers", async () => {
        const sent = send()
        const variantId = await createVariant(getContainer(), "T-shirt")
        const order = await createOrder(getContainer(), [{ variant_id: variantId, quantity: 1 }])
        await payOrderInFull(getContainer(), order.id, 100)

        await deliver(order.id)

        expect(sent).not.toHaveBeenCalled()
        expect(await service().listVoucherDeliveries({ order_id: order.id })).toEqual([])
      })

      it("sends the store's own email when a renderer is configured", async () => {
        const sent = send()
        const render = jest.spyOn(testEmailRenderer, "render").mockImplementation(({ order, vouchers }) => ({
          subject: `บัตรกำนัลของคุณ #${order.display_id}`,
          html: vouchers.map((v) => `<p>${v.code} <img src="cid:${v.qr_code_cid}"></p>`).join(""),
          text: vouchers.map((v) => v.code).join("\n"),
        }))
        const order = await allocatedOrder([
          { title: "100", quantity: 1, vouchers: [{ code: "COFFEE-0001", pin: "4321" }] },
        ])

        await deliver(order.id)

        expect(render).toHaveBeenCalledWith({
          order: expect.objectContaining({ id: order.id, display_id: order.display_id }),
          vouchers: [expect.objectContaining({ code: "COFFEE-0001", pin: "4321" })],
        })
        const { content, attachments } = sent.mock.calls[0][0]
        expect(content).toEqual({
          subject: `บัตรกำนัลของคุณ #${order.display_id}`,
          html: `<p>COFFEE-0001 <img src="cid:${attachments?.[0].id}"></p>`,
          text: "COFFEE-0001",
        })
      })

      it("leaves no code, PIN or hash in Medusa's notification records or the logs", async () => {
        const logger = getContainer().resolve(ContainerRegistrationKeys.LOGGER)
        const logged = (["info", "warn", "error", "debug", "log"] as const).map((level) =>
          jest.spyOn(logger, level)
        )
        const order = await allocatedOrder([
          { title: "100", quantity: 1, vouchers: [{ code: "COFFEE-0001", pin: "4321" }] },
        ])
        const [voucher] = await service().listVouchers({ status: VoucherStatus.ALLOCATED })

        await deliver(order.id)

        const notifications = await getContainer()
          .resolve(Modules.NOTIFICATION)
          .listNotifications({ resource_id: order.id })
        expect(notifications).toHaveLength(1)
        const stored = JSON.stringify(notifications)
        const logs = logged.flatMap((spy) => spy.mock.calls).map((call) => JSON.stringify(call)).join("\n")
        for (const secret of ["COFFEE-0001", "4321", voucher.code_hash]) {
          expect(stored).not.toContain(secret)
          expect(logs).not.toContain(secret)
        }
      })
    })
  },
})
