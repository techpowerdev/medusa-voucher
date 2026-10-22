import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import { AllocationFailureStatus } from "../../modules/voucher/constants"
import VoucherModuleService from "../../modules/voucher/service"
import { allocateVouchersForPaidOrderWorkflow } from "../allocate-vouchers-for-paid-order"
import { errorMessage } from "../utils/error-message"

export type RetryAllocationFailuresResult = {
  allocated: string[]
  still_open: string[]
  failed: string[]
}

// Tries each order waiting on an open failure of the Voucher product once, oldest failure
// first, through the trigger workflow so the Paid order rule applies. Allocation is all or
// none per order, and a successful one resolves the order's failures. An order whose
// allocation throws is logged and reported as failed, and the later orders are still tried.
export const retryOrdersWaitingOnFailuresStep = createStep(
  "retry-orders-waiting-on-failures",
  async (input: { voucher_product_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)

    const { data: voucherProducts } = await query.graph({
      entity: "voucher_product",
      fields: ["id", "product_variant.id"],
      filters: { id: input.voucher_product_id },
    })
    const variantId = voucherProducts[0]?.product_variant?.id

    if (!voucherProducts.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Voucher product ${input.voucher_product_id} was not found`
      )
    }

    const failures = variantId
      ? await service.listAllocationFailures(
          { variant_id: variantId, status: AllocationFailureStatus.OPEN },
          { select: ["order_id"], order: { created_at: "ASC", id: "ASC" } }
        )
      : []
    const orderIds = [...new Set(failures.map((failure) => failure.order_id))]
    const result: RetryAllocationFailuresResult = { allocated: [], still_open: [], failed: [] }

    for (const orderId of orderIds) {
      try {
        const { result: allocation } = await allocateVouchersForPaidOrderWorkflow(container).run({
          input: { order_id: orderId },
        })

        if (allocation?.allocated.length) {
          result.allocated.push(orderId)
        } else {
          result.still_open.push(orderId)
        }
      } catch (error) {
        result.failed.push(orderId)
        logger.error(
          `@khumkha/medusa-voucher: could not retry the Allocation failures of order ${orderId}: ` +
            errorMessage(error)
        )
      }
    }

    return new StepResponse(result)
  }
)
