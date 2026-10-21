import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { importVoucherBatchWorkflow } from "../../../../workflows/import-voucher-batch"
import { ImportVoucherBatchBody } from "../middlewares"

// The response never includes voucher codes: it returns the batch and how many vouchers
// were stored.
export const POST = async (
  req: AuthenticatedMedusaRequest<ImportVoucherBatchBody>,
  res: MedusaResponse
) => {
  const { result } = await importVoucherBatchWorkflow(req.scope).run({
    input: { ...req.validatedBody, imported_by: req.auth_context.actor_id },
  })

  res.status(201).json(result)
}
