import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  RECOVERY_PAGE_SIZE,
  recoverUnallocatedPaidOrdersStep,
} from "./steps/recover-unallocated-paid-orders"

export const recoverUnallocatedPaidOrdersWorkflowId = "recover-unallocated-paid-orders"

/**
 * Allocates the Paid orders that were never allocated because a subscriber threw or its event
 * never arrived: orders created between 7 days and 10 minutes before `now` (default: the
 * current time) with a Voucher product line and neither an Allocation nor an Allocation
 * failure, read `page_size` at a time (default 500). Returns the orders checked, the ones
 * recovered, the ones whose recovery threw, and the number of pages read.
 */
export const recoverUnallocatedPaidOrdersWorkflow = createWorkflow(
  recoverUnallocatedPaidOrdersWorkflowId,
  (input: { now?: string; page_size?: number }) => {
    const stepInput = transform({ input }, ({ input }) => ({
      now: input.now ?? new Date().toISOString(),
      page_size: input.page_size ?? RECOVERY_PAGE_SIZE,
    }))

    return new WorkflowResponse(recoverUnallocatedPaidOrdersStep(stepInput))
  }
)
