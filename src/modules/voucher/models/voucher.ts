import { model } from "@medusajs/framework/utils"

const Voucher = model.define("voucher", {
  id: model.id().primaryKey(),
  code: model.text().unique(),
  metadata: model.json().nullable(),
})

export default Voucher
