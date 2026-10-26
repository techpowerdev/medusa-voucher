import { model } from "@medusajs/framework/utils"
import { AllocationFailureStatus } from "../constants"

const VoucherAllocationFailure = model
  .define("voucher_allocation_failure", {
    id: model.id({ prefix: "vfail" }).primaryKey(),
    order_id: model.text(),
    order_line_item_id: model.text(),
    variant_id: model.text(),
    quantity_requested: model.number(),
    quantity_available: model.number(),
    status: model.enum(AllocationFailureStatus).default(AllocationFailureStatus.OPEN),
    resolved_at: model.dateTime().nullable(),
    resolution_note: model.text().nullable(),
    resolved_by: model.text().nullable(),
  })
  .indexes([
    { on: ["order_id"] },
    { on: ["status"] },
    // A short line waits on one open failure; a resolved one leaves room for the next.
    {
      on: ["order_line_item_id"],
      unique: true,
      where: "deleted_at IS NULL AND status = 'open'",
    },
  ])

export default VoucherAllocationFailure
