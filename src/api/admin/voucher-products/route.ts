import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VOUCHER_MODULE } from "../../../modules/voucher"
import { VoucherStatus } from "../../../modules/voucher/constants"
import VoucherModuleService from "../../../modules/voucher/service"
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

  // The count shown is the Pool of Available Vouchers of the linked variant.
  const voucherProducts = await Promise.all(
    data.map(async (voucherProduct) => {
      const [, available] = await service.listAndCountVouchers(
        {
          variant_id: voucherProduct.product_variant?.id,
          status: VoucherStatus.AVAILABLE,
        },
        { select: ["id"], take: 1 }
      )

      return { ...voucherProduct, available_vouchers: available }
    })
  )

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
