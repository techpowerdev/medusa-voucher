import { countCsvRows } from "../csv"

describe("countCsvRows", () => {
  it("counts no rows in an empty file or one with only its header", () => {
    expect(countCsvRows("")).toBe(0)
    expect(countCsvRows("code,pin,valid_from,valid_until\n")).toBe(0)
  })

  it("counts each data row under the header, with or without a final line break", () => {
    expect(countCsvRows("code\nAAAA-1111\nBBBB-2222\nCCCC-3333\n")).toBe(3)
    expect(countCsvRows("code\nAAAA-1111\nBBBB-2222\nCCCC-3333")).toBe(3)
  })

  it("counts Windows line breaks the same way", () => {
    expect(countCsvRows("code\r\nAAAA-1111\r\nBBBB-2222\r\n")).toBe(2)
  })

  it("leaves out blank lines, as the import does", () => {
    expect(countCsvRows("code\nAAAA-1111\n\n  \nBBBB-2222\n\n")).toBe(2)
  })
})
