import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { getOrderDetailWorkflow } from "@medusajs/medusa/core-flows"
import { fulfillVoucherLinesStep } from "./steps/fulfill-voucher-lines"
import { sendOrderVouchersStep } from "./steps/send-order-vouchers"
import { isPaidOrder } from "./utils/paid-order"

export const deliverOrderVouchersWorkflowId = "deliver-order-vouchers"

/**
 * Sends a Paid order's Vouchers to its email in one message (a Delivery on the `email`
 * channel), through the provider the host configured on the Notification module, then
 * records Medusa's fulfillment of its Voucher lines as delivered (ADR-0005). An order that is
 * not, or no longer, a Paid order is left alone and gets no Delivery. Safe to run more than
 * once for the same order: only one run sends.
 */
export const deliverOrderVouchersWorkflow = createWorkflow(
  deliverOrderVouchersWorkflowId,
  (input: { order_id: string }) => {
    const order = getOrderDetailWorkflow.runAsStep({
      input: { order_id: input.order_id, fields: ["id", "total"] },
    })

    const delivery = when({ order }, ({ order }) => isPaidOrder(order)).then(() =>
      sendOrderVouchersStep({ order_id: input.order_id })
    )

    when({ delivery }, ({ delivery }) => !!delivery?.delivered).then(() =>
      fulfillVoucherLinesStep({ order_id: input.order_id })
    )

    // `null` when the order is not a Paid order and nothing was tried.
    return new WorkflowResponse(transform({ delivery }, ({ delivery }) => delivery ?? null))
  }
)
