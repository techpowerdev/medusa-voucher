import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import { DeliveryChannel, DeliveryStatus } from "../../modules/voucher/constants"
import VoucherModuleService from "../../modules/voucher/service"
import { deliverOrderVouchersWorkflow } from "../deliver-order-vouchers"
import { errorMessage } from "../utils/error-message"

const MINUTE = 60 * 1000

// Deliveries and Allocations older than this are no longer tried.
export const DELIVERY_RETRY_LOOKBACK_MS = 7 * 24 * 60 * MINUTE
// Allocations younger than this are left to the subscriber, which may still be running, and
// a Delivery sending for longer than this was interrupted.
export const DELIVERY_RETRY_MARGIN_MS = 10 * MINUTE
// A Delivery that failed this many times stays failed for an operator.
export const DELIVERY_MAX_ATTEMPTS = 5
// Rows are read this many at a time, so memory and query parameters stay bounded.
export const DELIVERY_RETRY_PAGE_SIZE = 500

export type RetryVoucherDeliveriesInput = { now: string; page_size: number }

export type DeliveryRetryOutcome = {
  // Orders whose failed or interrupted Delivery was tried again.
  retried: string[]
  // Orders that had Allocations but no email Delivery, and were tried.
  recovered: string[]
  // Orders whose try threw; they are tried again on the next run.
  failed: string[]
  pages: number
}

// Reads rows a page at a time by id, so rows that change as they are handled are neither
// skipped nor read twice.
async function eachPage<T extends { id: string }>(
  pageSize: number,
  read: (afterId: string | undefined) => Promise<T[]>,
  handle: (rows: T[]) => Promise<void>
) {
  let pages = 0

  for (let afterId: string | undefined; ; ) {
    const rows = await read(afterId)

    if (!rows.length) {
      break
    }

    pages += 1
    afterId = rows[rows.length - 1].id
    await handle(rows)

    if (rows.length < pageSize) {
      break
    }
  }

  return pages
}

// Sends an order through the delivery workflow, which checks the Paid order rule and claims
// the Delivery. True when this run claimed it and tried; false when the order is not a Paid
// order or another run holds or delivered it. An error is logged and recorded, never thrown.
async function deliverOrder(container: MedusaContainer, orderId: string, outcome: DeliveryRetryOutcome) {
  try {
    const { result } = await deliverOrderVouchersWorkflow(container).run({ input: { order_id: orderId } })

    return !!result?.delivery_id
  } catch (error) {
    outcome.failed.push(orderId)
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(
        `@khumkha/medusa-voucher: could not deliver order ${orderId}, will try again: ${errorMessage(error)}`
      )

    return false
  }
}

// Tries again the email Deliveries that failed fewer than 5 times or were interrupted while
// sending, and sends the orders allocated inside the window ending at `now` that have no
// email Delivery. Each order runs on its own, so one that throws cannot stop the others.
// Logs carry ids, never codes.
export const retryVoucherDeliveriesStep = createStep(
  "retry-voucher-deliveries",
  async (input: RetryVoucherDeliveriesInput, { container }) => {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    const now = new Date(input.now).getTime()
    const outcome: DeliveryRetryOutcome = { retried: [], recovered: [], failed: [], pages: 0 }

    // With automatic delivery off the store sends by calling the delivery workflow itself.
    if (!(await service.getDeliverySettings()).automatic) {
      return new StepResponse(outcome)
    }

    await service.releaseStaleDeliveries({ before: new Date(now - DELIVERY_RETRY_MARGIN_MS) })

    outcome.pages += await eachPage(
      input.page_size,
      (afterId) =>
        service.listVoucherDeliveries(
          {
            channel: DeliveryChannel.EMAIL,
            status: DeliveryStatus.FAILED,
            attempts: { $lt: DELIVERY_MAX_ATTEMPTS },
            created_at: { $gte: new Date(now - DELIVERY_RETRY_LOOKBACK_MS), $lte: new Date(now) },
            ...(afterId ? { id: { $gt: afterId } } : {}),
          },
          { select: ["id", "order_id"], take: input.page_size, order: { id: "ASC" } }
        ),
      async (deliveries) => {
        for (const { order_id } of deliveries) {
          if (await deliverOrder(container, order_id, outcome)) {
            outcome.retried.push(order_id)
            logger.info(`@khumkha/medusa-voucher: tried the Delivery of order ${order_id} again`)
          }
        }
      }
    )

    // An order's Allocations can span pages; it is tried once.
    const seen = new Set<string>()

    outcome.pages += await eachPage(
      input.page_size,
      (afterId) =>
        service.listVoucherAllocations(
          {
            replaces_allocation_id: null,
            created_at: {
              $gte: new Date(now - DELIVERY_RETRY_LOOKBACK_MS),
              $lte: new Date(now - DELIVERY_RETRY_MARGIN_MS),
            },
            ...(afterId ? { id: { $gt: afterId } } : {}),
          },
          { select: ["id", "order_id"], take: input.page_size, order: { id: "ASC" } }
        ),
      async (allocations) => {
        const orderIds = [...new Set(allocations.map((allocation) => allocation.order_id))].filter(
          (id) => !seen.has(id)
        )
        orderIds.forEach((id) => seen.add(id))

        if (!orderIds.length) {
          return
        }

        const delivered = await service.listVoucherDeliveries(
          { order_id: orderIds, channel: DeliveryChannel.EMAIL },
          { select: ["order_id"] }
        )
        const withDelivery = new Set(delivered.map((delivery) => delivery.order_id))

        for (const orderId of orderIds.filter((id) => !withDelivery.has(id))) {
          // A run that claims it means the subscriber did not do its work, which a person
          // should notice.
          if (await deliverOrder(container, orderId, outcome)) {
            outcome.recovered.push(orderId)
            logger.warn(
              `@khumkha/medusa-voucher: sent order ${orderId}, whose Delivery never started`
            )
          }
        }
      }
    )

    return new StepResponse(outcome)
  }
)
