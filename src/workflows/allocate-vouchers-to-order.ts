import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { allocateVouchersStep } from "./steps/allocate-vouchers"
import { loadOrderVoucherLinesStep } from "./steps/load-order-voucher-lines"

export const allocateVouchersToOrderWorkflowId = "allocate-vouchers-to-order"

/**
 * Allocates one Voucher to each purchased unit of an order's Voucher product lines, all or
 * none for the order. Lines of other variants are ignored. The result never contains codes.
 */
export const allocateVouchersToOrderWorkflow = createWorkflow(
  allocateVouchersToOrderWorkflowId,
  (input: { order_id: string }) => {
    const lines = loadOrderVoucherLinesStep({ order_id: input.order_id })

    return new WorkflowResponse(allocateVouchersStep(lines))
  }
)
