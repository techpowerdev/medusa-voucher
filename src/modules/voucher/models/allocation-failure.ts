import { model } from "@medusajs/framework/utils"
import { ALLOCATION_FAILURE_STATUSES } from "../constants"

const AllocationFailure = model
  .define("allocation_failure", {
    id: model.id({ prefix: "vfail" }).primaryKey(),
    order_id: model.text(),
    order_line_item_id: model.text(),
    variant_id: model.text(),
    quantity_requested: model.number(),
    quantity_available: model.number(),
    status: model.enum([...ALLOCATION_FAILURE_STATUSES]).default("open"),
    resolved_at: model.dateTime().nullable(),
    resolution_note: model.text().nullable(),
    resolved_by: model.text().nullable(),
  })
  .indexes([{ on: ["order_id"] }, { on: ["status"] }])

export default AllocationFailure
