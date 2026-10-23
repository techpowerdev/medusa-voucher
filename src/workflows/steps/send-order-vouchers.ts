import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import QRCode from "qrcode"
import { VOUCHER_MODULE } from "../../modules/voucher"
import { DeliveryChannel } from "../../modules/voucher/constants"
import VoucherModuleService from "../../modules/voucher/service"
import { dayOf } from "../../modules/voucher/utils/timezone"
import { errorMessage } from "../utils/error-message"
import { renderVoucherEmail } from "../utils/render-voucher-email"

// Replaces every secret in a message with a marker.
function redact(message: string, secrets: string[]): string {
  return secrets.reduce((text, secret) => text.split(secret).join("[redacted]"), message)
}

// What a failed Delivery records: the error's type and the first line of its message, which
// for a provider failure is Medusa's own ("Failed to send notification with id ...").
function safeError(error: unknown, secrets: string[]): string {
  const type = (error as { type?: unknown } | null)?.type
  const firstLine = errorMessage(error).split("\n")[0]

  return redact(typeof type === "string" ? `${type}: ${firstLine}` : firstLine, secrets)
}

// The last day a Voucher can be used: `valid_until` is the first instant it no longer applies.
function lastDay(validUntil: Date, timeZone: string): string {
  return dayOf(new Date(validUntil.getTime() - 1), timeZone)
}

// The Delivery this run claimed and tried, or null when the order has no Vouchers, another
// run holds it, or it was delivered already.
export type SendOrderVouchersResult = { delivery_id: string | null }

/**
 * Sends an order's first-time Allocations to its email in one message. Codes go only into
 * the rendered content, never into the notification's data.
 */
export const sendOrderVouchersStep = createStep(
  "send-order-vouchers",
  async (input: { order_id: string }, { container }): Promise<StepResponse<SendOrderVouchersResult>> => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)

    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "email"],
      filters: { id: input.order_id },
    })
    const order = orders[0]

    if (!order) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order ${input.order_id} was not found`)
    }

    const allocations = await service.listVoucherAllocations(
      { order_id: order.id, replaces_allocation_id: null },
      {
        relations: ["voucher", "voucher.batch"],
        order: { order_line_item_id: "ASC", unit_index: "ASC" },
      }
    )

    // An order without Vouchers has nothing to send and gets no Delivery.
    if (!allocations.length) {
      return new StepResponse({ delivery_id: null })
    }

    // Only the caller that claims the Delivery sends, so concurrent runs send once.
    const delivery = await service.claimDelivery({
      order_id: order.id,
      channel: DeliveryChannel.EMAIL,
      recipient: order.email ?? null,
    })

    if (!delivery) {
      return new StepResponse({ delivery_id: null })
    }

    if (!order.email) {
      await service.failDelivery({ id: delivery.id, error: "The order has no email address" })

      return new StepResponse({ delivery_id: delivery.id })
    }

    // The Partner is the Medusa product's title; the Face value is on the Voucher product.
    const variantIds = [...new Set(allocations.map((allocation) => allocation.voucher.variant_id))]
    const { data: variants } = variantIds.length
      ? await query.graph({
          entity: "product_variant",
          fields: ["id", "product.title", "voucher_product.face_value", "voucher_product.currency_code"],
          filters: { id: variantIds },
        })
      : { data: [] }
    const variantsById = new Map(variants.map((variant) => [variant.id, variant]))

    const { timezone, renderers } = await service.getDeliverySettings()
    const render = renderers.email ?? renderVoucherEmail

    const vouchers = await Promise.all(
      allocations.map(async ({ id, voucher }) => {
        const variant = variantsById.get(voucher.variant_id)
        const { code, pin } = await service.revealVoucher(voucher.id)

        return {
          code,
          pin,
          partner: variant?.product?.title ?? "",
          face_value: Number(variant?.voucher_product?.face_value),
          currency_code: variant?.voucher_product?.currency_code ?? "",
          first_day: voucher.valid_from ? dayOf(new Date(voucher.valid_from), timezone) : null,
          last_day: voucher.valid_until ? lastDay(new Date(voucher.valid_until), timezone) : null,
          redemption_instructions: voucher.batch?.redemption_instructions ?? null,
          qr_code_cid: `qr-${id}`,
        }
      })
    )

    try {
      const email = await render({
        order: { id: order.id, display_id: order.display_id, email: order.email },
        vouchers,
      })

      // A QR code of the code alone (never the PIN), generated now and never stored. Inline
      // attachments rather than data URIs, which Gmail blocks.
      const attachments = await Promise.all(
        vouchers.map(async (voucher) => ({
          id: voucher.qr_code_cid,
          filename: `${voucher.qr_code_cid}.png`,
          content_type: "image/png",
          disposition: "inline",
          content: (await QRCode.toBuffer(voucher.code, { type: "png" })).toString("base64"),
        }))
      )

      await container.resolve(Modules.NOTIFICATION).createNotifications({
        to: order.email,
        channel: DeliveryChannel.EMAIL,
        template: "voucher-delivery",
        content: email,
        attachments,
        resource_type: "order",
        resource_id: order.id,
        // Medusa skips a key that already succeeded, so each attempt has its own.
        idempotency_key: `${delivery.id}:${delivery.attempts}`,
      })
    } catch (error) {
      // The provider's reason may quote the message, so the order's secrets are removed
      // before it is logged, and only Medusa's own first line is stored.
      const secrets = vouchers.flatMap((voucher) => [voucher.code, voucher.pin ?? ""]).filter(Boolean)
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .error(
          `@khumkha/medusa-voucher: Delivery ${delivery.id} of order ${order.id} failed: ${redact(errorMessage(error), secrets)}`
        )
      await service.failDelivery({ id: delivery.id, error: safeError(error, secrets) })

      return new StepResponse({ delivery_id: delivery.id })
    }

    await service.completeDelivery({
      id: delivery.id,
      voucher_ids: allocations.map(({ voucher }) => voucher.id),
    })

    return new StepResponse({ delivery_id: delivery.id })
  }
)
