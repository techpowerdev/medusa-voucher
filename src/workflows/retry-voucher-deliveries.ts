import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  DELIVERY_RETRY_PAGE_SIZE,
  retryVoucherDeliveriesStep,
} from "./steps/retry-voucher-deliveries"

export const retryVoucherDeliveriesWorkflowId = "retry-voucher-deliveries"

/**
 * Tries again the email Deliveries created within 7 days before `now` (default: the current
 * time) that failed fewer than 5 times or have been sending for more than 10 minutes, and
 * sends the orders allocated between 7 days and 10 minutes before `now` that have no email
 * Delivery, reading `page_size` rows at a time (default 500). Only Paid orders are sent.
 * Then records the fulfillment of orders delivered within 7 days whose Voucher lines are not
 * yet fulfilled, unless `delivery.fulfill` is false. Does nothing when `delivery.automatic`
 * is false. Returns the orders retried, recovered and fulfilled, the ones whose try threw,
 * and the number of pages read.
 */
export const retryVoucherDeliveriesWorkflow = createWorkflow(
  retryVoucherDeliveriesWorkflowId,
  (input: { now?: string; page_size?: number }) => {
    const stepInput = transform({ input }, ({ input }) => ({
      now: input.now ?? new Date().toISOString(),
      page_size: input.page_size ?? DELIVERY_RETRY_PAGE_SIZE,
    }))

    return new WorkflowResponse(retryVoucherDeliveriesStep(stepInput))
  }
)
