import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { retryVoucherAllocationFailuresStep } from "./steps/retry-voucher-allocation-failures"

export const retryAllocationFailuresWorkflowId = "retry-voucher-allocation-failures"

/**
 * Retries the open Allocation failures of a Voucher product, oldest first, one order at a time
 * with the same all-or-none allocation as a new order. Returns the orders allocated, the
 * ones still waiting and the ones whose allocation threw (logged; the others are still tried). Orders that are no longer Paid orders stay waiting for an operator.
 */
export const retryAllocationFailuresWorkflow = createWorkflow(
  retryAllocationFailuresWorkflowId,
  (input: { voucher_product_id: string }) => {
    return new WorkflowResponse(retryVoucherAllocationFailuresStep(input))
  }
)
