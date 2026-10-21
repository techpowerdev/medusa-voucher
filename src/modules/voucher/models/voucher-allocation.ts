import { model } from "@medusajs/framework/utils"
import { DeliveryStatus } from "../constants"
import Voucher from "./voucher"

// One Voucher assigned to one purchased unit of an order line item. A Replacement
// creates a new allocation that points back to the one it replaces.
const VoucherAllocation = model
  .define("voucher_allocation", {
    id: model.id({ prefix: "valloc" }).primaryKey(),
    order_id: model.text(),
    order_line_item_id: model.text(),
    // Which unit of the line item this serves, counting from 1.
    unit_index: model.number(),
    customer_id: model.text().nullable(),
    recipient_email: model.text().nullable(),
    delivery_channel: model.text().default("email"),
    delivery_status: model.enum(DeliveryStatus).default(DeliveryStatus.PENDING),
    delivery_attempts: model.number().default(0),
    delivery_error: model.text().nullable(),
    delivered_at: model.dateTime().nullable(),
    replaces_allocation_id: model.text().nullable(),
    replacement_reason: model.text().nullable(),
    replaced_by: model.text().nullable(),
    voucher: model.belongsTo(() => Voucher, { mappedBy: "allocation" }),
  })
  .indexes([
    { on: ["order_id"] },
    { on: ["order_line_item_id"] },
    // A unit is served once. A Replacement serves the same unit again, so it is exempt.
    {
      on: ["order_line_item_id", "unit_index"],
      unique: true,
      where: "deleted_at IS NULL AND replaces_allocation_id IS NULL",
    },
  ])

export default VoucherAllocation
