import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { VoucherImportProblem } from "../../../../modules/voucher/utils/import-error"
import { importVoucherBatchWorkflow } from "../../../../workflows/import-voucher-batch"
import { MAX_REPORTED_IMPORT_PROBLEMS } from "../../../../workflows/steps/parse-voucher-csv"
import { ImportVoucherBatchBody } from "../middlewares"

// The response never includes voucher codes: it returns the batch and how many vouchers
// were stored. A refused file is answered here, as Medusa's cart completion does, so the
// body can list its problems beside the message; any other error goes to the error handler.
export const POST = async (
  req: AuthenticatedMedusaRequest<ImportVoucherBatchBody>,
  res: MedusaResponse
) => {
  const { result, errors } = await importVoucherBatchWorkflow(req.scope).run({
    input: { ...req.validatedBody, imported_by: req.auth_context.actor_id },
    throwOnError: false,
  })

  if (errors?.[0]) {
    const error = errors[0].error
    const problems: VoucherImportProblem[] | undefined = error?.problems

    if (error?.type !== MedusaError.Types.INVALID_DATA || !Array.isArray(problems)) {
      throw error
    }

    res.status(400).json({
      type: error.type,
      message: error.message,
      problems: problems.slice(0, MAX_REPORTED_IMPORT_PROBLEMS),
      problem_count: problems.length,
    })
    return
  }

  res.status(201).json(result)
}
