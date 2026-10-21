import { model } from "@medusajs/framework/utils"
import Voucher from "./voucher"

const VoucherBatch = model.define("voucher_batch", {
  id: model.id({ prefix: "vbatch" }).primaryKey(),
  partner: model.text(),
  variant_id: model.text().index(),
  face_value: model.bigNumber(),
  currency_code: model.text(),
  unit_cost: model.bigNumber().nullable(),
  purchased_at: model.dateTime(),
  reference: model.text().nullable(),
  redemption_instructions: model.text().nullable(),
  imported_by: model.text().nullable(),
  metadata: model.json().nullable(),
  vouchers: model.hasMany(() => Voucher, { mappedBy: "batch" }),
})

export default VoucherBatch
