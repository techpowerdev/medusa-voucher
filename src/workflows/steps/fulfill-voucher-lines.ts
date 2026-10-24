import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"
import { fulfillOrderVoucherLines } from "../utils/fulfill-order-voucher-lines"

/**
 * Records Medusa's fulfillment of the order's Voucher lines as delivered, unless
 * `delivery.fulfill` is false. A failure is logged and never undoes or repeats the Delivery;
 * the retry job records it later. Returns whether it recorded anything.
 */
export const fulfillVoucherLinesStep = createStep(
  "fulfill-voucher-lines",
  async (input: { order_id: string }, { container }) => {
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)

    if (!(await service.getDeliverySettings()).fulfill) {
      return new StepResponse(false)
    }

    return new StepResponse(await fulfillOrderVoucherLines(container, input.order_id))
  }
)
