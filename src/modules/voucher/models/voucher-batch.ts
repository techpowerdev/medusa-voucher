import { model } from "@medusajs/framework/utils"
import Voucher from "./voucher"

// A batch is one purchase for a Voucher product. The Face value and currency are the Voucher
// product's and the Partner is not stored (ADR-0003). `variant_id` is the Voucher product's
// variant at import time, copied so a Pool can be queried without a cross-module join.
const VoucherBatch = model.define("voucher_batch", {
  id: model.id({ prefix: "vbatch" }).primaryKey(),
  voucher_product_id: model.text().index(),
  variant_id: model.text().index(),
  unit_cost: model.bigNumber().nullable(),
  purchased_at: model.dateTime(),
  reference: model.text().nullable(),
  redemption_instructions: model.text().nullable(),
  imported_by: model.text().nullable(),
  metadata: model.json().nullable(),
  vouchers: model.hasMany(() => Voucher, { mappedBy: "batch" }),
})

export default VoucherBatch
