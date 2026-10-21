import { model } from "@medusajs/framework/utils"

// Marks a product variant as one that delivers Vouchers (see ADR-0003). The variant is
// connected through a module link, not a column. The Partner is not stored: the Medusa
// product the variant belongs to already says whose voucher it is.
const VoucherProduct = model
  .define("voucher_product", {
    id: model.id({ prefix: "vprod" }).primaryKey(),
    face_value: model.bigNumber(),
    currency_code: model.text(),
  })
  .checks([
    {
      name: "voucher_product_face_value_positive_check",
      expression: (columns) => `${columns.face_value} > 0`,
    },
  ])

export default VoucherProduct
