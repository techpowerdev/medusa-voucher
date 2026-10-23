import { MedusaError } from "@medusajs/framework/utils"

export const DEFAULT_TIMEZONE = "Asia/Bangkok"

export function assertValidTimezone(timeZone: unknown): asserts timeZone is string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timeZone as string })
  } catch {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `@khumkha/medusa-voucher: the "timezone" option must be an IANA time zone such as "Asia/Bangkok", got ${JSON.stringify(timeZone)}`
    )
  }
}

// How far the zone is ahead of UTC at the given instant, in milliseconds.
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(instant))

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))

  return asUtc - Math.floor(instant / 1000) * 1000
}

/**
 * The instant at which the calendar date `year-month-day` starts (00:00) in `timeZone`.
 * `day` may overflow (day + 1 on the last day of a month) and rolls into the next month.
 */
export function startOfDay(year: number, month: number, day: number, timeZone: string): Date {
  const local = Date.UTC(year, month - 1, day)
  // The offset depends on the instant being sought, so refine the first guess once.
  const first = local - offsetAt(local, timeZone)
  const second = local - offsetAt(first, timeZone)

  return new Date(second)
}

/** The calendar date (`YYYY-MM-DD`) that contains the instant in `timeZone`. */
export function dayOf(instant: Date, timeZone: string): string {
  // en-CA formats a date as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant)
}
