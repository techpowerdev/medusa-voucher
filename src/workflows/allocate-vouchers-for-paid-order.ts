import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { getOrderDetailWorkflow } from "@medusajs/medusa/core-flows"
import { allocateVouchersToOrderWorkflow } from "./allocate-vouchers-to-order"
import { isPaidOrder } from "./utils/paid-order"

export const allocateVouchersForPaidOrderWorkflowId = "allocate-vouchers-for-paid-order"

/**
 * Allocates an order's Vouchers once the order is fully paid, meaning Medusa's own payment
 * status for it is `captured`, or it has a total of 0 and no payment collection. A canceled,
 * authorized, partly captured or refunded order is left alone. Safe to run more than once
 * for the same order.
 */
export const allocateVouchersForPaidOrderWorkflow = createWorkflow(
  allocateVouchersForPaidOrderWorkflowId,
  (input: { order_id: string }) => {
    const order = getOrderDetailWorkflow.runAsStep({
      input: { order_id: input.order_id, fields: ["id", "total"] },
    })

    const allocation = when({ order }, ({ order }) => isPaidOrder(order)).then(
      () => allocateVouchersToOrderWorkflow.runAsStep({ input: { order_id: input.order_id } })
    )

    // `null` when the order is not fully paid and nothing was tried.
    return new WorkflowResponse(transform({ allocation }, ({ allocation }) => allocation ?? null))
  }
)
