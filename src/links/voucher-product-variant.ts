import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import VoucherModule from "../modules/voucher"

// A Voucher product is exactly one product variant (ADR-0003).
export default defineLink(
  VoucherModule.linkable.voucherProduct,
  ProductModule.linkable.productVariant
)
