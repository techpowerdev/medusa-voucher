import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CustomerVoucher } from "../../../../../modules/voucher/types"

// What the store shows of a customer's Vouchers: each with its order's display number and its
// product and variant titles, which Medusa owns. Never a code.
export async function customerVoucherViews(scope: MedusaContainer, vouchers: CustomerVoucher[]) {
  if (!vouchers.length) {
    return []
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const [{ data: orders }, { data: variants }] = await Promise.all([
    query.graph({
      entity: "order",
      fields: ["id", "display_id"],
      filters: { id: [...new Set(vouchers.map((voucher) => voucher.order_id))] },
    }),
    query.graph({
      entity: "product_variant",
      fields: ["id", "title", "product.title"],
      filters: { id: [...new Set(vouchers.map((voucher) => voucher.variant_id))] },
    }),
  ])
  const displayIds = new Map(orders.map((order) => [order.id, order.display_id]))
  const titles = new Map(variants.map((variant) => [variant.id, variant]))

  return vouchers.map(({ order_id, variant_id, ...voucher }) => ({
    id: voucher.id,
    status: voucher.status,
    code_hint: voucher.code_hint,
    order: { id: order_id, display_id: displayIds.get(order_id) ?? null },
    product: { title: titles.get(variant_id)?.product?.title ?? null },
    variant: { title: titles.get(variant_id)?.title ?? null },
    face_value: voucher.face_value,
    currency_code: voucher.currency_code,
    first_day: voucher.first_day,
    last_day: voucher.last_day,
    redemption_instructions: voucher.redemption_instructions,
  }))
}
