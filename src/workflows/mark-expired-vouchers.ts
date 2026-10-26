import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { markExpiredVouchersStep } from "./steps/mark-expired-vouchers"

export const markExpiredVouchersWorkflowId = "mark-expired-vouchers"

/**
 * Marks the Available Vouchers whose Validity period has ended by `now` (default: the current
 * time) as Expired. Allocated, Delivered and Void Vouchers keep their status. Returns how many
 * were marked.
 */
export const markExpiredVouchersWorkflow = createWorkflow(
  markExpiredVouchersWorkflowId,
  (input: { now?: string }) => {
    const stepInput = transform({ input }, ({ input }) => ({ now: input.now ?? new Date().toISOString() }))

    return new WorkflowResponse(markExpiredVouchersStep(stepInput))
  }
)
