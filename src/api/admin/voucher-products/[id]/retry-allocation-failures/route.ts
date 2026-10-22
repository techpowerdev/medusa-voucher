import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { retryAllocationFailuresWorkflow } from "../../../../../workflows/retry-allocation-failures"

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { result } = await retryAllocationFailuresWorkflow(req.scope).run({
    input: { voucher_product_id: req.params.id },
  })

  res.json(result)
}
