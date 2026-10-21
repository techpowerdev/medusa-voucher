import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { updateVoucherProductWorkflow } from "../../../../workflows/update-voucher-product"
import { UpdateVoucherProductBody } from "../middlewares"

export const POST = async (
  req: AuthenticatedMedusaRequest<UpdateVoucherProductBody>,
  res: MedusaResponse
) => {
  const { result } = await updateVoucherProductWorkflow(req.scope).run({
    input: { id: req.params.id, ...req.validatedBody },
  })

  res.json({ voucher_product: result })
}
