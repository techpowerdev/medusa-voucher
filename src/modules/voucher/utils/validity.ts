import { MedusaError } from "@medusajs/framework/utils"

export function assertValidMinimumRemainingValidityDays(days: unknown): asserts days is number {
  if (typeof days !== "number" || !Number.isInteger(days) || days < 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `@khumkha/medusa-voucher: the "minimumRemainingValidityDays" option must be a whole number of days, 0 or more, got ${JSON.stringify(days)}`
    )
  }
}
