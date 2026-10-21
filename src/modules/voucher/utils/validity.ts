import { MedusaError } from "@medusajs/framework/utils"

export const DAY_MS = 24 * 60 * 60 * 1000

export function assertValidMinimumRemainingValidityDays(days: unknown): asserts days is number {
  if (typeof days !== "number" || !Number.isInteger(days) || days < 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `@khumkha/medusa-voucher: the "minimumRemainingValidityDays" option must be a whole number of days, 0 or more, got ${JSON.stringify(days)}`
    )
  }
}

/**
 * Whether a Voucher has enough validity left to be allocated at `now`: time is counted
 * from the later of `now` and the start of its validity to the end of it, and a Voucher
 * that never ends always passes. A Voucher already past its end never does.
 */
export function hasEnoughValidityLeft(
  voucher: { valid_from?: Date | null; valid_until?: Date | null },
  now: Date,
  minimumDays: number
): boolean {
  if (!voucher.valid_until) {
    return true
  }

  const start = Math.max(now.getTime(), voucher.valid_from?.getTime() ?? 0)

  return voucher.valid_until.getTime() > now.getTime() &&
    voucher.valid_until.getTime() - start >= minimumDays * DAY_MS
}
