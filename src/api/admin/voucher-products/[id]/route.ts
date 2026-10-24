import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { VOUCHER_MODULE } from "../../../../modules/voucher"
import VoucherModuleService from "../../../../modules/voucher/service"
import { emptyPoolCounts } from "../../../../modules/voucher/types"
import { updateVoucherProductWorkflow } from "../../../../workflows/update-voucher-product"
import { UpdateVoucherProductBody } from "../middlewares"

// A Voucher product with its variant, the Medusa product that stands for its Partner, and its
// Pool counted by status. Never a code.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const service: VoucherModuleService = req.scope.resolve(VOUCHER_MODULE)
  const { data } = await query.graph({
    entity: "voucher_product",
    fields: [
      "id",
      "face_value",
      "currency_code",
      "product_variant.id",
      "product_variant.title",
      "product_variant.product.id",
      "product_variant.product.title",
    ],
    filters: { id: req.params.id },
  })
  const voucherProduct = data[0]

  if (!voucherProduct) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Voucher product ${req.params.id} was not found`)
  }

  const variantId = voucherProduct.product_variant?.id
  const counts = variantId ? (await service.countPoolByVariant([variantId])).get(variantId) : undefined

  res.json({ voucher_product: { ...voucherProduct, counts: counts ?? emptyPoolCounts() } })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<UpdateVoucherProductBody>,
  res: MedusaResponse
) => {
  const { result } = await updateVoucherProductWorkflow(req.scope).run({
    input: { id: req.params.id, ...req.validatedBody },
  })

  res.json({ voucher_product: result })
}
