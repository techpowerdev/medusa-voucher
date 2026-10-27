import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createVoucherBatchStep, CreateVoucherBatchStepInput } from "./steps/create-voucher-batch"
import { createVouchersFromCodesStep } from "./steps/create-vouchers-from-codes"
import { parseVoucherCsvStep } from "./steps/parse-voucher-csv"
import { resolveVoucherProductVariantStep } from "./steps/resolve-voucher-product-variant"
import { retryVoucherAllocationFailuresAfterImportStep } from "./steps/retry-voucher-allocation-failures-after-import"

export type ImportVoucherBatchInput = Omit<CreateVoucherBatchStepInput, "variant_id"> & {
  csv: string
}

export const importVoucherBatchWorkflowId = "import-voucher-batch"

/**
 * Creates a Voucher batch for a Voucher product and stores the vouchers listed in a CSV file
 * for it. The CSV is
 * checked first, so a file with any problem creates nothing. Once stored, the open Allocation
 * failures of the Voucher product are retried; `allocation_retry` is the retry's result, or
 * null when it failed as a whole (logged), which keeps the import.
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

    const retryInput = transform({ input }, ({ input }) => ({
      voucher_product_id: input.voucher_product_id,
    }))
    const allocationRetry = retryVoucherAllocationFailuresAfterImportStep(retryInput)

    const result = transform(
      { batch, imported, allocationRetry },
      ({ batch, imported, allocationRetry }) => ({
        voucher_batch: batch,
        imported,
        allocation_retry: allocationRetry,
      })
    )

    return new WorkflowResponse(result)
  }
)
