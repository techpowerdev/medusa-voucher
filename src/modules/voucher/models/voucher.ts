import { model } from "@medusajs/framework/utils"
import { VOUCHER_STATUSES } from "../constants"
import VoucherAllocation from "./voucher-allocation"
import VoucherBatch from "./voucher-batch"

// The validity period runs from `valid_from` until `valid_until`; either end may be
// open. `pin_encrypted` is the optional second secret some Partners require.
// `variant_id` repeats the batch's value so the Pool of a Voucher product can be
// queried and claimed without joining the batch. It never changes after import.
// `code_encrypted` holds the code, `code_hash` is a keyed hash used to reject
// duplicates, and `code_hint` is the last characters shown masked in the admin.
const Voucher = model
  .define("voucher", {
    id: model.id({ prefix: "vch" }).primaryKey(),
    code_encrypted: model.text(),
    code_hash: model.text().unique(),
    code_hint: model.text(),
    pin_encrypted: model.text().nullable(),
    status: model.enum([...VOUCHER_STATUSES]).default("available"),
    valid_from: model.dateTime().nullable(),
    valid_until: model.dateTime().nullable(),
    void_reason: model.text().nullable(),
    voided_at: model.dateTime().nullable(),
    voided_by: model.text().nullable(),
    variant_id: model.text(),
    batch: model.belongsTo(() => VoucherBatch, { mappedBy: "vouchers" }),
    allocation: model
      .hasOne(() => VoucherAllocation, { mappedBy: "voucher" })
      .nullable(),
  })
  .indexes([{ on: ["variant_id", "status", "valid_until"] }])

export default Voucher
