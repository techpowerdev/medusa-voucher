import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { emitEventStep } from "@medusajs/medusa/core-flows"
import { VoucherEvents } from "../modules/voucher/constants"
import { allocateVouchersStep } from "./steps/allocate-vouchers"
import { loadOrderVoucherLinesStep } from "./steps/load-order-voucher-lines"

export const allocateVouchersToOrderWorkflowId = "allocate-vouchers-to-order"

/**
 * Allocates one Voucher to each purchased unit of an order's Voucher product lines, all or
 * none for the order. Lines of other variants are ignored. The result never contains codes.
 * Emits `voucher.allocated` with the order id when this run made the Allocations.
 */
export const allocateVouchersToOrderWorkflow = createWorkflow(
  allocateVouchersToOrderWorkflowId,
  (input: { order_id: string }) => {
    const lines = loadOrderVoucherLinesStep({ order_id: input.order_id })
    const result = allocateVouchersStep(lines)

    // Medusa releases a workflow's events once the workflow has finished, so delivery
    // never starts before the Allocations are committed.
    when({ result }, ({ result }) => result.created).then(() =>
      emitEventStep({
        eventName: VoucherEvents.ALLOCATED,
        data: transform({ input }, ({ input }) => ({ order_id: input.order_id })),
      })
    )

    return new WorkflowResponse(result)
  }
)
