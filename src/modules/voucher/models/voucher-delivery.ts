import { model } from "@medusajs/framework/utils"
import { DeliveryChannel, DeliveryStatus } from "../constants"

// One order's Vouchers sent together on one channel (ADR-0004). It never holds a code.
const VoucherDelivery = model
  .define("voucher_delivery", {
    id: model.id({ prefix: "vdel" }).primaryKey(),
    order_id: model.text(),
    channel: model.enum(DeliveryChannel),
    recipient: model.text().nullable(),
    status: model.enum(DeliveryStatus).default(DeliveryStatus.PENDING),
    attempts: model.number().default(0),
    last_error: model.text().nullable(),
    delivered_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["status"] },
    // An order is delivered once per channel.
    { on: ["order_id", "channel"], unique: true, where: "deleted_at IS NULL" },
  ])

export default VoucherDelivery
