import { BigNumberInput } from "@medusajs/framework/types"
import { MathBN, OrderStatus } from "@medusajs/framework/utils"

// A Paid order (GLOSSARY.md) that is not canceled: Medusa reports its payment as captured,
// or it costs nothing and was completed without payment (a cart with a total of 0 skips
// payment, so the order has no payment collection; a zero-amount collection already counts
// as captured).
export function isPaidOrder(order: {
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
