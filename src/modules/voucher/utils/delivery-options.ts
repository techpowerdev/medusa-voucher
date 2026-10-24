import { MedusaError } from "@medusajs/framework/utils"

export function assertValidAutomaticDelivery(automatic: unknown): asserts automatic is boolean {
  if (typeof automatic !== "boolean") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `@khumkha/medusa-voucher: the "delivery.automatic" option must be true or false, got ${JSON.stringify(automatic)}`
    )
  }
}
