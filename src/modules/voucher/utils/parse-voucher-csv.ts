import { CsvError, parse } from "csv-parse/sync"
import { VoucherCodeInput } from "../types"
import { startOfDay } from "./timezone"

export const MAX_CSV_VOUCHERS = 50000

const COLUMNS = ["code", "pin", "valid_from", "valid_until"] as const

export type CsvRowError = {
  line: number
  message: string
}

export type ParsedVoucherCsv = {
  vouchers: VoucherCodeInput[]
  errors: CsvRowError[]
}

const DATE_HINT = (column: string) =>
  `${column} must be a date as YYYY-MM-DD or DD-MM-YYYY`

export const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_FIRST_DATE = /^(\d{2})-(\d{2})-(\d{4})$/

// Reads YYYY-MM-DD or DD-MM-YYYY as a real calendar date. JavaScript would roll a day
// that does not exist (2026-02-30) over to the next month, silently moving an expiry, so
// the date is checked by building it back.
export function parseCalendarDate(value: string): [number, number, number] | null {
  const iso = ISO_DATE.exec(value)
  const dayFirst = DAY_FIRST_DATE.exec(value)

  let parts: [number, number, number]

  if (iso) {
    parts = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  } else if (dayFirst) {
    parts = [Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1])]
  } else {
    return null
  }

  const [year, month, day] = parts
  const check = new Date(Date.UTC(year, month - 1, day))

  return check.getUTCMonth() === month - 1 && check.getUTCDate() === day
    ? parts
    : null
}

/**
 * Reads a CSV file of vouchers: a header row naming the columns `code` (required),
 * `pin`, `valid_from` and `valid_until`, then one voucher per row. A date alone (given as
 * YYYY-MM-DD or DD-MM-YYYY) means the whole day in `timeZone`: `valid_from` starts at its
 * 00:00 and `valid_until` ends at the 00:00 of the next day. Every problem is
 * reported with its line number and none echoes a code or PIN, so a file can be fixed
 * in one pass.
 */
export function parseVoucherCsv(content: string, timeZone: string): ParsedVoucherCsv {
  const errors: CsvRowError[] = []
  const vouchers: VoucherCodeInput[] = []

  let records: { record: Record<string, string>; info: { lines: number } }[]

  try {
    records = parse(content, {
      bom: true,
      trim: true,
      skip_empty_lines: true,
      info: true,
      columns: (header: string[]) => header.map((name) => name.trim().toLowerCase()),
    })
  } catch (error) {
    if (error instanceof CsvError) {
      return {
        vouchers: [],
        errors: [
          {
            line: Number(error.lines) || 1,
            message: "The row is not valid CSV or has a different number of columns than the header",
          },
        ],
      }
    }

    throw error
  }

  if (!records.length) {
    return { vouchers: [], errors: [{ line: 1, message: "The file has no voucher rows" }] }
  }

  const header = Object.keys(records[0].record)

  if (!header.includes("code")) {
    errors.push({ line: 1, message: 'The header must have a "code" column' })
  }

  for (const name of header) {
    if (!(COLUMNS as readonly string[]).includes(name)) {
      errors.push({ line: 1, message: `Unknown column "${name}"` })
    }
  }

  if (errors.length) {
    return { vouchers: [], errors }
  }

  if (records.length > MAX_CSV_VOUCHERS) {
    return {
      vouchers: [],
      errors: [
        {
          line: 1,
          message: `The file has more than ${MAX_CSV_VOUCHERS} vouchers; split it into several batches`,
        },
      ],
    }
  }

  for (const { record, info } of records) {
    const line = info.lines
    const rowErrors: string[] = []

    if (!record.code) {
      rowErrors.push("The code is empty")
    }

    const from = record.valid_from ? parseCalendarDate(record.valid_from) : null
    const until = record.valid_until ? parseCalendarDate(record.valid_until) : null

    if (record.valid_from && !from) {
      rowErrors.push(DATE_HINT("valid_from"))
    }

    if (record.valid_until && !until) {
      rowErrors.push(DATE_HINT("valid_until"))
    }

    const valid_from = from ? startOfDay(from[0], from[1], from[2], timeZone) : null
    // The whole day counts, so the period ends where the following day starts.
    const valid_until = until ? startOfDay(until[0], until[1], until[2] + 1, timeZone) : null

    if (valid_from && valid_until && valid_until <= valid_from) {
      rowErrors.push("valid_until is before valid_from")
    }

    if (rowErrors.length) {
      rowErrors.forEach((message) => errors.push({ line, message }))
      continue
    }

    vouchers.push({
      code: record.code,
      pin: record.pin || null,
      valid_from,
      valid_until,
      source_line: line,
    })
  }

  return errors.length ? { vouchers: [], errors } : { vouchers, errors }
}
