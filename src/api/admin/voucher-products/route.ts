import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VOUCHER_MODULE } from "../../../modules/voucher"
import VoucherModuleService from "../../../modules/voucher/service"
import { emptyPoolCounts } from "../../../modules/voucher/types"
import { createVoucherProductWorkflow } from "../../../workflows/create-voucher-product"
import { CreateVoucherProductBody } from "./middlewares"

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const service: VoucherModuleService = req.scope.resolve(VOUCHER_MODULE)
  const { data, metadata } = await query.graph({
    entity: "voucher_product",
    fields: ["id", "face_value", "currency_code", "product_variant.id"],
    pagination: req.queryConfig.pagination,
  })

  // `available_vouchers` is the Available count (Vouchers that can still be sold); `counts`
  // has the rest of the Pool, read in one query for the page.
  const counts = await service.countPool(
    "variant",
    data.map((voucherProduct) => voucherProduct.product_variant?.id).filter((id): id is string => !!id)
  )
  const voucherProducts = data.map((voucherProduct) => {
    const pool = counts.get(voucherProduct.product_variant?.id ?? "") ?? emptyPoolCounts()

    return { ...voucherProduct, available_vouchers: pool.available, counts: pool }
  })

  res.json({
    voucher_products: voucherProducts,
    count: metadata?.count ?? voucherProducts.length,
    limit: req.queryConfig.pagination.take,
    offset: req.queryConfig.pagination.skip,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<CreateVoucherProductBody>,
  res: MedusaResponse
) => {
  const { result } = await createVoucherProductWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  res.status(201).json({ voucher_product: result })
}
