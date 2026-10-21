import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createVoucherBatchStep, CreateVoucherBatchStepInput } from "./steps/create-voucher-batch"
import { createVouchersFromCodesStep } from "./steps/create-vouchers-from-codes"
import { parseVoucherCsvStep } from "./steps/parse-voucher-csv"
import { validateVoucherVariantStep } from "./steps/validate-voucher-variant"

export type ImportVoucherBatchInput = CreateVoucherBatchStepInput & {
  csv: string
}

export const importVoucherBatchWorkflowId = "import-voucher-batch"

/**
 * Creates a Voucher batch and stores the vouchers listed in a CSV file for it. The CSV is
 * checked first, so a file with any problem creates nothing.
 */
export const importVoucherBatchWorkflow = createWorkflow(
  importVoucherBatchWorkflowId,
  (input: ImportVoucherBatchInput) => {
    validateVoucherVariantStep({ variant_id: input.variant_id })

    const csv = transform({ input }, ({ input }) => ({ csv: input.csv }))
    const vouchers = parseVoucherCsvStep(csv)

    const batchInput = transform({ input }, ({ input: { csv: _csv, ...batch } }) => batch)
    const batch = createVoucherBatchStep(batchInput)

    const voucherInput = transform({ batch, vouchers }, ({ batch, vouchers }) => ({
      batch_id: batch.id,
      vouchers,
    }))
    const imported = createVouchersFromCodesStep(voucherInput)

    const result = transform({ batch, imported }, ({ batch, imported }) => ({
      voucher_batch: batch,
      imported,
    }))

    return new WorkflowResponse(result)
  }
)
