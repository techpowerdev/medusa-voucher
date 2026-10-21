import { model } from "@medusajs/framework/utils"
import { VOUCHER_STATUSES } from "../constants"
import VoucherAllocation from "./voucher-allocation"
import VoucherBatch from "./voucher-batch"

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
    status: model.enum([...VOUCHER_STATUSES]).default("available"),
    expires_at: model.dateTime().nullable(),
    variant_id: model.text(),
    batch: model.belongsTo(() => VoucherBatch, { mappedBy: "vouchers" }),
    allocation: model
      .hasOne(() => VoucherAllocation, { mappedBy: "voucher" })
      .nullable(),
  })
  .indexes([{ on: ["variant_id", "status", "expires_at"] }])

export default Voucher
