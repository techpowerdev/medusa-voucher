import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VOUCHER_MODULE } from "../../../../../modules/voucher"
import VoucherModuleService from "../../../../../modules/voucher/service"
import { ListPoolVouchersQuery } from "../../middlewares"
import { voucherProductVariantId } from "../../voucher-product-variant"

// A page of a Voucher product's Vouchers, soonest to expire first, with the order each went
// to. Never a code: only its hint.
export const GET = async (req: AuthenticatedMedusaRequest<unknown, ListPoolVouchersQuery>, res: MedusaResponse) => {
  const variantId = await voucherProductVariantId(req.scope, req.params.id)
  const service: VoucherModuleService = req.scope.resolve(VOUCHER_MODULE)
  const { skip = 0, take = 20 } = req.queryConfig.pagination
  const [vouchers, count] = await service.listPoolVouchers({
    variant_id: variantId,
    status: req.validatedQuery.status,
    batch_id: req.validatedQuery.batch_id,
    skip,
    take,
  })

  const orderIds = [...new Set(vouchers.map((voucher) => voucher.order_id).filter((id): id is string => !!id))]
  const { data: orders } = orderIds.length
    ? await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "order",
        fields: ["id", "display_id"],
        filters: { id: orderIds },
      })
    : { data: [] }
  const displayIds = new Map(orders.map((order) => [order.id, order.display_id]))

  res.json({
    vouchers: vouchers.map(({ order_id, ...voucher }) => ({
      ...voucher,
      order: order_id ? { id: order_id, display_id: displayIds.get(order_id) ?? null } : null,
    })),
    count,
    limit: take,
    offset: skip,
  })
}
