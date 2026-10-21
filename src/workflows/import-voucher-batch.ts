import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createVoucherBatchStep, CreateVoucherBatchStepInput } from "./steps/create-voucher-batch"
import { createVouchersFromCodesStep } from "./steps/create-vouchers-from-codes"
import { parseVoucherCsvStep } from "./steps/parse-voucher-csv"
import { resolveVoucherProductVariantStep } from "./steps/resolve-voucher-product-variant"

export type ImportVoucherBatchInput = Omit<CreateVoucherBatchStepInput, "variant_id"> & {
  csv: string
}

export const importVoucherBatchWorkflowId = "import-voucher-batch"

/**
 * Creates a Voucher batch for a Voucher product and stores the vouchers listed in a CSV file
 * for it. The CSV is
 * checked first, so a file with any problem creates nothing.
 */
export const importVoucherBatchWorkflow = createWorkflow(
  importVoucherBatchWorkflowId,
  (input: ImportVoucherBatchInput) => {
    const variantId = resolveVoucherProductVariantStep({
      voucher_product_id: input.voucher_product_id,
    })

    const csv = transform({ input }, ({ input }) => ({ csv: input.csv }))
    const vouchers = parseVoucherCsvStep(csv)

    const batchInput = transform({ input, variantId }, ({ input: { csv: _csv, ...batch }, variantId }) => ({
      ...batch,
      variant_id: variantId,
    }))
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
