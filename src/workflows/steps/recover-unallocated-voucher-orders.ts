import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"
import { allocateVouchersForPaidOrderWorkflow } from "../allocate-vouchers-for-paid-order"
import { errorMessage } from "../utils/error-message"

const MINUTE = 60 * 1000

// Orders older than this are no longer tried.
export const RECOVERY_LOOKBACK_MS = 7 * 24 * 60 * MINUTE
// Orders younger than this are left to their subscribers, which may still be running.
export const RECOVERY_MARGIN_MS = 10 * MINUTE
// Orders are read and checked this many at a time, so memory and query parameters stay
// bounded however many orders the window holds.
export const RECOVERY_PAGE_SIZE = 500

export type RecoverUnallocatedPaidOrdersInput = { now: string; page_size: number }

export type RecoveredOrder = { order_id: string; allocated: number; failures: number }

export type RecoveryOutcome = {
  checked: string[]
  recovered: RecoveredOrder[]
  failed: string[]
  pages: number
}

// The orders of `orderIds` that have an Allocation or an Allocation failure of any status:
// allocated, or the operator's.
async function handledOrderIds(service: VoucherModuleService, orderIds: string[]) {
  const [allocations, failures] = await Promise.all([
    service.listVoucherAllocations({ order_id: orderIds }, { select: ["order_id"] }),
    service.listVoucherAllocationFailures({ order_id: orderIds }, { select: ["order_id"] }),
  ])

  return new Set([...allocations, ...failures].map((row) => row.order_id))
}

async function voucherVariantIds(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: voucherProducts } = await query.graph({
    entity: "voucher_product",
    fields: ["product_variant.id"],
  })

  return voucherProducts
    .map((voucherProduct) => voucherProduct.product_variant?.id)
    .filter((id): id is string => !!id)
}

// Tries every order created inside the window ending at `now` that has a Voucher product line
// and neither an Allocation nor an Allocation failure, a page at a time. Each order runs the
// trigger workflow on its own, so one that throws cannot stop the others; it is tried again
// on the next run. A recovered order means a subscriber did not do its work, so it is logged
// for a person to notice. Logs carry ids and counts, never codes.
export const recoverUnallocatedVoucherOrdersStep = createStep(
  "recover-unallocated-voucher-orders",
  async (input: RecoverUnallocatedPaidOrdersInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    const now = new Date(input.now).getTime()
    const outcome: RecoveryOutcome = { checked: [], recovered: [], failed: [], pages: 0 }

    const variantIds = await voucherVariantIds(container)

    if (!variantIds.length) {
      return new StepResponse(outcome)
    }

    // Recovering an order does not change which orders match, so paging by offset is stable.
    for (let skip = 0; ; skip += input.page_size) {
      const { data: orders } = await query.graph({
        entity: "order",
        fields: ["id"],
        filters: {
          items: { variant_id: variantIds },
          created_at: {
            $gte: new Date(now - RECOVERY_LOOKBACK_MS),
            $lte: new Date(now - RECOVERY_MARGIN_MS),
          },
        },
        pagination: { skip, take: input.page_size, order: { created_at: "ASC", id: "ASC" } },
      })

      if (!orders.length) {
        break
      }

      outcome.pages += 1
      const handled = await handledOrderIds(service, orders.map((order) => order.id))
      const candidates = orders.map((order) => order.id).filter((id) => !handled.has(id))

      for (const orderId of candidates) {
        outcome.checked.push(orderId)

        try {
          // A subscriber may have allocated the order since the page was read; checking again
          // keeps that from being reported as a recovery.
          if ((await handledOrderIds(service, [orderId])).size) {
            continue
          }

          const { result } = await allocateVouchersForPaidOrderWorkflow(container).run({
            input: { order_id: orderId },
          })

          // Not a Paid order yet, or nothing to allocate.
          if (!result || (!result.allocated.length && !result.failures.length)) {
            continue
          }

          const recovered = {
            order_id: orderId,
            allocated: result.allocated.length,
            failures: result.failures.length,
          }
          outcome.recovered.push(recovered)
          logger.warn(
            `@khumkha/medusa-voucher: recovered order ${orderId} that was never allocated ` +
              `(${recovered.allocated} Vouchers allocated, ${recovered.failures} Allocation failures)`
          )
        } catch (error) {
          outcome.failed.push(orderId)
          logger.error(
            `@khumkha/medusa-voucher: could not recover order ${orderId}, will try again: ` +
              errorMessage(error)
          )
        }
      }

      if (orders.length < input.page_size) {
        break
      }
    }

    return new StepResponse(outcome)
  }
)
