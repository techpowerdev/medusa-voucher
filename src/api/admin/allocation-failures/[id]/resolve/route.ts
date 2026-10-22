import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveAllocationFailureWorkflow } from "../../../../../workflows/resolve-allocation-failure"
import { ResolveAllocationFailureBody } from "../../middlewares"

export const POST = async (
  req: AuthenticatedMedusaRequest<ResolveAllocationFailureBody>,
  res: MedusaResponse
) => {
  const { result } = await resolveAllocationFailureWorkflow(req.scope).run({
    input: {
      id: req.params.id,
      note: req.validatedBody.note,
      resolved_by: req.auth_context.actor_id,
    },
  })

  res.json({ allocation_failure: result })
}
