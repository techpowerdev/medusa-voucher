import { parseVoucherCsv } from "../utils/parse-voucher-csv"
import { assertValidTimezone, startOfDay } from "../utils/timezone"

const parse = (content: string, timeZone = "Asia/Bangkok") =>
  parseVoucherCsv(content, timeZone)

describe("parseVoucherCsv", () => {
  it("reads codes, PINs and validity dates as whole days with their source lines", () => {
    const { vouchers, errors } = parse(
      [
        "code,pin,valid_from,valid_until",
        "AAAA-1111,1234,2026-01-01,2026-12-31",
        "BBBB-2222,,,",
        "",
        "CCCC-3333,,01-02-2026,28-02-2026",
      ].join("\n")
    )

    expect(errors).toEqual([])
    expect(vouchers).toEqual([
      {
        code: "AAAA-1111",
        pin: "1234",
        // 00:00 on 1 Jan up to 00:00 on 1 Jan the next year, Bangkok time (UTC+7)
        valid_from: new Date("2025-12-31T17:00:00.000Z"),
        valid_until: new Date("2026-12-31T17:00:00.000Z"),
        source_line: 2,
      },
      { code: "BBBB-2222", pin: null, valid_from: null, valid_until: null, source_line: 3 },
      {
        code: "CCCC-3333",
        pin: null,
        valid_from: new Date("2026-01-31T17:00:00.000Z"),
        valid_until: new Date("2026-02-28T17:00:00.000Z"),
        source_line: 5,
      },
    ])
  })

  it("counts the whole last day, including a month or year end", () => {
    const [voucher] = parse("code,valid_until\nAAAA,31-12-2026").vouchers

    expect(voucher.valid_until).toEqual(new Date("2026-12-31T17:00:00.000Z"))
  })

  it("uses the configured time zone", () => {
    const [voucher] = parse("code,valid_from,valid_until\nAAAA,2026-06-01,2026-06-01", "UTC").vouchers

    expect(voucher.valid_from).toEqual(new Date("2026-06-01T00:00:00.000Z"))
    expect(voucher.valid_until).toEqual(new Date("2026-06-02T00:00:00.000Z"))
  })

  it("accepts a code-only file, a BOM, CRLF and any header case", () => {
    const { vouchers, errors } = parse("﻿Code\r\nAAAA\r\nBBBB\r\n")

    expect(errors).toEqual([])
    expect(vouchers.map((v) => v.code)).toEqual(["AAAA", "BBBB"])
  })

  it("reports every bad row with its line and never echoes a code or PIN", () => {
    const { vouchers, errors } = parse(
      [
        "code,pin,valid_from,valid_until",
        "SECRET-CODE-1,9999,2026/12/31,",
        ",1234,,",
        "SECRET-CODE-3,,2026-06-01,2026-01-01",
      ].join("\n")
    )

    expect(vouchers).toEqual([])
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4])
    expect(JSON.stringify(errors)).not.toMatch(/SECRET|9999/)
  })

  it("rejects a time, a two-digit year and dates that do not exist", () => {
    const { errors } = parse(
      [
        "code,valid_until",
        "A,2026-12-31T10:00:00",
        "B,31-12-26",
        "C,2026-02-30",
        "D,31-04-2026",
      ].join("\n")
    )

    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5])
  })

  it("rejects a missing code column and unknown columns", () => {
    expect(parse("pin\n1234").errors[0].message).toMatch(/"code" column/)
    expect(parse("code,colour\nAAAA,red").errors[0].message).toMatch(/Unknown column "colour"/)
  })

  it("rejects an empty file and a row with the wrong number of columns", () => {
    expect(parse("code,pin\n").errors[0].message).toMatch(/no voucher rows/)

    const { errors } = parse("code,pin\nAAAA,1,extra")

    expect(errors).toEqual([expect.objectContaining({ line: 2 })])
    expect(JSON.stringify(errors)).not.toMatch(/AAAA/)
  })
})

describe("parseVoucherCsv problem codes", () => {
  it("codes a row that is not valid CSV", () => {
    expect(parse("code,pin\nAAAA,1,extra").errors).toEqual([
      expect.objectContaining({ line: 2, code: "invalid_csv_row" }),
    ])
  })

  it("codes a file without voucher rows", () => {
    expect(parse("code,pin\n").errors).toEqual([
      expect.objectContaining({ line: 1, code: "no_rows" }),
    ])
  })

  it("codes a header without a code column", () => {
    expect(parse("pin\n1234").errors).toEqual([
      expect.objectContaining({ line: 1, code: "missing_code_column" }),
    ])
  })

  it("codes each unknown column with its name", () => {
    expect(parse("code,colour,size\nAAAA,red,L").errors).toEqual([
      expect.objectContaining({ line: 1, code: "unknown_column", column: "colour" }),
      expect.objectContaining({ line: 1, code: "unknown_column", column: "size" }),
    ])
  })

  it("codes a file over the row limit with the limit", () => {
    const rows = Array.from({ length: 50001 }, (_, index) => `CODE-${index}`)

    expect(parse(["code", ...rows].join("\n")).errors).toEqual([
      expect.objectContaining({ line: 1, code: "too_many_rows", max: 50000 }),
    ])
  })

  it("codes an empty code", () => {
    expect(parse("code,pin\nAAAA,1\n,1234").errors).toEqual([
      expect.objectContaining({ line: 3, code: "empty_code" }),
    ])
  })

  it("codes a date that is not a calendar date with its column", () => {
    expect(parse("code,valid_from,valid_until\nAAAA,2026/01/01,2026-02-30").errors).toEqual([
      expect.objectContaining({ line: 2, code: "invalid_date", column: "valid_from" }),
      expect.objectContaining({ line: 2, code: "invalid_date", column: "valid_until" }),
    ])
  })

  it("codes a validity period that ends before it starts", () => {
    expect(parse("code,valid_from,valid_until\nAAAA,2026-06-01,2026-01-01").errors).toEqual([
      expect.objectContaining({ line: 2, code: "period_ends_before_start" }),
    ])
  })
})

describe("time zones", () => {
  it("finds the start of a day in zones ahead of and behind UTC, with daylight saving", () => {
    expect(startOfDay(2026, 1, 1, "Asia/Bangkok")).toEqual(new Date("2025-12-31T17:00:00.000Z"))
    expect(startOfDay(2026, 1, 1, "America/New_York")).toEqual(new Date("2026-01-01T05:00:00.000Z"))
    expect(startOfDay(2026, 7, 1, "America/New_York")).toEqual(new Date("2026-07-01T04:00:00.000Z"))
    expect(startOfDay(2026, 12, 32, "UTC")).toEqual(new Date("2027-01-01T00:00:00.000Z"))
  })

  it("rejects an unknown time zone", () => {
    expect(() => assertValidTimezone("Mars/Olympus")).toThrow(/IANA time zone/)
    expect(() => assertValidTimezone("Asia/Bangkok")).not.toThrow()
  })
})
