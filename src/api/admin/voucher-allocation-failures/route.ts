import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VOUCHER_MODULE } from "../../../modules/voucher"
import VoucherModuleService from "../../../modules/voucher/service"
import { ListAllocationFailuresQuery } from "./middlewares"

// An Allocation failure as the admin API shows it: no Voucher is involved, so no secret can
// appear, and the Voucher product stands in for the variant it was recorded with.
const FIELDS = [
  "id",
  "order_id",
  "order_line_item_id",
  "variant_id",
  "quantity_requested",
  "quantity_available",
  "status",
  "resolved_at",
  "resolved_by",
  "resolution_note",
  "created_at",
]

export const GET = async (
  req: AuthenticatedMedusaRequest<unknown, ListAllocationFailuresQuery>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const service: VoucherModuleService = req.scope.resolve(VOUCHER_MODULE)
  const { status, voucher_product_id } = req.validatedQuery

  const { data: voucherProducts } = await query.graph({
    entity: "voucher_product",
    fields: ["id", "product_variant.id"],
    filters: voucher_product_id ? { id: voucher_product_id } : {},
  })
  const voucherProductByVariant = new Map(
    voucherProducts
      .filter((voucherProduct) => voucherProduct.product_variant?.id)
      .map((voucherProduct) => [voucherProduct.product_variant!.id, voucherProduct.id])
  )

  const [failures, count] = voucher_product_id && !voucherProductByVariant.size
    ? [[], 0]
    : await service.listAndCountVoucherAllocationFailures(
        {
          status,
          ...(voucher_product_id ? { variant_id: [...voucherProductByVariant.keys()] } : {}),
        },
        {
          select: FIELDS,
          order: { created_at: "ASC", id: "ASC" },
          take: req.queryConfig.pagination.take,
          skip: req.queryConfig.pagination.skip,
        }
      )

  res.json({
    voucher_allocation_failures: failures.map(({ variant_id, ...failure }) => ({
      ...failure,
      voucher_product_id: voucherProductByVariant.get(variant_id) ?? null,
    })),
    count,
    limit: req.queryConfig.pagination.take,
    offset: req.queryConfig.pagination.skip,
  })
}
