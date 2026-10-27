import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MathBN,
  MedusaError,
  OrderStatus,
} from "@medusajs/framework/utils"
import {
  createOrderFulfillmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"
import { errorMessage } from "./error-message"

// What is left to record for an order's Voucher lines (ADR-0005): fulfillments made but not
// yet marked delivered, and the quantities not yet fulfilled.
export type VoucherFulfillmentState = {
  order_id: string
  canceled: boolean
  to_mark: string[]
  to_create: { id: string; quantity: number }[]
  order_shipping_option_id: string | null
}

export const isComplete = (state: VoucherFulfillmentState) =>
  !state.to_mark.length && !state.to_create.length

const toNumber = (value: unknown) => MathBN.convert((value ?? 0) as any).toNumber()

/**
 * Reads, for each of `orderIds`, what its first-time Allocations delivered and what Medusa
 * has recorded of it, in two queries. An order without Allocations has nothing to record.
 */
export async function readVoucherFulfillment(
  container: MedusaContainer,
  orderIds: string[]
): Promise<Map<string, VoucherFulfillmentState>> {
  const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const states = new Map<string, VoucherFulfillmentState>()

  if (!orderIds.length) {
    return states
  }

  const allocations = await service.listVoucherAllocations(
    { order_id: orderIds, replaces_allocation_id: null },
    { select: ["order_id", "order_line_item_id"] }
  )
  // Units delivered per Voucher line.
  const units = new Map<string, number>()
  for (const { order_line_item_id } of allocations) {
    units.set(order_line_item_id, (units.get(order_line_item_id) ?? 0) + 1)
  }

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "shipping_methods.shipping_option_id",
      "items.id",
      "items.detail.fulfilled_quantity",
      "fulfillments.id",
      "fulfillments.delivered_at",
      "fulfillments.canceled_at",
      "fulfillments.items.line_item_id",
    ],
    filters: { id: [...new Set(allocations.map((allocation) => allocation.order_id))] },
  })

  for (const order of orders) {
    states.set(order.id, {
      order_id: order.id,
      canceled: order.status === OrderStatus.CANCELED,
      to_mark: (order.fulfillments ?? [])
        .filter(
          (fulfillment) =>
            fulfillment &&
            !fulfillment.delivered_at &&
            !fulfillment.canceled_at &&
            fulfillment.items?.some((item) => item && units.has(item.line_item_id!))
        )
        .map((fulfillment) => fulfillment!.id),
      to_create: (order.items ?? [])
        .filter((item) => item && units.has(item.id))
        .map((item) => ({
          id: item!.id,
          quantity: units.get(item!.id)! - toNumber(item!.detail?.fulfilled_quantity),
        }))
        .filter((item) => item.quantity > 0),
      order_shipping_option_id: order.shipping_methods?.[0]?.shipping_option_id ?? null,
    })
  }

  return states
}

/**
 * Records what is left of an order's Voucher fulfillment: marks delivered a fulfillment made
 * but not marked, and fulfills the rest as delivered, both without notifying the customer.
 * The shipping option comes from `delivery.fulfillment.shippingOptionId`, else the order's
 * own shipping method. Returns true when it recorded anything; a canceled order is left alone.
 * Throws when Medusa refuses.
 */
export async function applyVoucherFulfillment(container: MedusaContainer, state: VoucherFulfillmentState) {
  if (state.canceled || isComplete(state)) {
    return false
  }

  for (const fulfillmentId of state.to_mark) {
    await markOrderFulfillmentAsDeliveredWorkflow(container).run({
      input: { orderId: state.order_id, fulfillmentId, no_notification: true },
    })
  }

  if (state.to_create.length) {
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    const configuredId = (await service.getDeliverySettings()).shippingOptionId
    const shippingOptionId = configuredId ?? state.order_shipping_option_id

    // Medusa would otherwise look the option up without an id.
    if (!shippingOptionId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Order ${state.order_id} has no shipping method; set the "delivery.fulfillment.shippingOptionId" option to fulfill its Voucher lines`
      )
    }

    // Medusa fails on a missing option with a message that does not name it.
    const { data: options } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph({ entity: "shipping_option", fields: ["id"], filters: { id: shippingOptionId } })

    if (!options.length) {
      const source = configuredId
        ? 'set in the "delivery.fulfillment.shippingOptionId" option'
        : `from the shipping method of order ${state.order_id}`

      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Shipping option ${shippingOptionId}, ${source}, was not found`
      )
    }

    const { result: fulfillment } = await createOrderFulfillmentWorkflow(container).run({
      input: {
        order_id: state.order_id,
        items: state.to_create,
        shipping_option_id: shippingOptionId,
        no_notification: true,
      },
    })
    await markOrderFulfillmentAsDeliveredWorkflow(container).run({
      input: { orderId: state.order_id, fulfillmentId: fulfillment.id, no_notification: true },
    })
  }

  return true
}

/**
 * Fulfills an order's Voucher lines after its Delivery. Never throws: a failure is logged as
 * an error with the order and the reason (the retry job tries it again), or as a warning
 * when another run recorded it meanwhile. Returns true when it recorded anything.
 */
export async function fulfillOrderVoucherLines(container: MedusaContainer, orderId: string) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    const state = (await readVoucherFulfillment(container, [orderId])).get(orderId)

    return state ? await applyVoucherFulfillment(container, state) : false
  } catch (error) {
    const message = errorMessage(error)
    const after = await readVoucherFulfillment(container, [orderId]).catch(() => null)
    const state = after?.get(orderId)

    if (state && isComplete(state)) {
      logger.warn(
        `@khumkha/medusa-voucher: order ${orderId}'s Voucher lines were fulfilled by another run: ${message}`
      )
    } else {
      logger.error(
        `@khumkha/medusa-voucher: could not fulfill the Voucher lines of order ${orderId}, will try again: ${message}`
      )
    }

    return false
  }
}
