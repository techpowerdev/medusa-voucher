import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { retryAllocationFailuresWorkflow } from "../retry-allocation-failures"
import { errorMessage } from "../utils/error-message"
import { RetryAllocationFailuresResult } from "./retry-voucher-allocation-failures"

// The retry's result, or null when it did not run.
export type AllocationRetryAfterImport = RetryAllocationFailuresResult | null

// Runs the retry of the Voucher product's open Allocation failures once the batch is stored.
// A step that throws makes Medusa compensate the earlier steps, which would remove the batch
// just stored, so an error of the retry as a whole is logged and answered with null instead,
// as Medusa's own compensatePaymentIfNeededStep does with the workflow it runs. Each order's
// allocation is its own workflow with its own compensation (see the retry), so this step
// writes nothing itself and has nothing to undo.
export const retryVoucherAllocationFailuresAfterImportStep = createStep(
  "retry-voucher-allocation-failures-after-import",
  async (input: { voucher_product_id: string }, { container }) => {
    try {
      const { result } = await retryAllocationFailuresWorkflow(container).run({ input })

      return new StepResponse<AllocationRetryAfterImport>(result)
    } catch (error) {
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .error(
          `@khumkha/medusa-voucher: the Vouchers were imported, but the Allocation failures of ` +
            `Voucher product ${input.voucher_product_id} could not be retried: ${errorMessage(error)}`
        )

      return new StepResponse<AllocationRetryAfterImport>(null)
    }
  }
)
