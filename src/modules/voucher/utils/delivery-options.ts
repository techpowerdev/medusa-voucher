import { MedusaError } from "@medusajs/framework/utils"

export function assertValidAutomaticDelivery(automatic: unknown): asserts automatic is boolean {
  if (typeof automatic !== "boolean") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `@khumkha/medusa-voucher: the "delivery.automatic" option must be true or false, got ${JSON.stringify(automatic)}`
    )
  }
}

export function assertValidFulfill(fulfill: unknown): asserts fulfill is boolean {
  if (typeof fulfill !== "boolean") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `@khumkha/medusa-voucher: the "delivery.fulfill" option must be true or false, got ${JSON.stringify(fulfill)}`
    )
  }
}

// The id itself can only be checked when a fulfillment is made: the database is not available
// while options load.
export function assertValidShippingOptionId(id: unknown) {
  if (id !== undefined && (typeof id !== "string" || !id.trim())) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `@khumkha/medusa-voucher: the "delivery.fulfillment.shippingOptionId" option must be a shipping option id, got ${JSON.stringify(id)}`
    )
  }
}
