import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { BigNumberInput } from "@medusajs/framework/types"
import { MathBN, OrderStatus } from "@medusajs/framework/utils"
import { getOrderDetailWorkflow } from "@medusajs/medusa/core-flows"
import { allocateVouchersToOrderWorkflow } from "./allocate-vouchers-to-order"

export const allocateVouchersForPaidOrderWorkflowId = "allocate-vouchers-for-paid-order"

// A Paid order (GLOSSARY.md) that is not canceled: Medusa reports its payment as captured,
// or it costs nothing and was completed without payment (a cart with a total of 0 skips
// payment, so the order has no payment collection; a zero-amount collection already counts
// as captured).
function canAllocate(order: {
  status?: string
  payment_status?: string
  total?: BigNumberInput
  payment_collections?: unknown[] | null
}): boolean {
  if (order.status === OrderStatus.CANCELED) {
    return false
  }

  if (order.payment_status === "captured") {
    return true
  }

  // A missing total must never read as 0, or any order without a collection would pass.
  return (
    !order.payment_collections?.length && order.total != null && MathBN.eq(order.total, 0)
  )
}

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

    const allocation = when({ order }, ({ order }) => canAllocate(order)).then(
      () => allocateVouchersToOrderWorkflow.runAsStep({ input: { order_id: input.order_id } })
    )

    // `null` when the order is not fully paid and nothing was tried.
    return new WorkflowResponse(transform({ allocation }, ({ allocation }) => allocation ?? null))
  }
)
