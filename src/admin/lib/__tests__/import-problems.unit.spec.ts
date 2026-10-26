import { describeImportFailure } from "../import-problems"

const format = (value: number) => `#${value}`

describe("describeImportFailure", () => {
  it("gives each problem its translation key and values, with numbers formatted", () => {
    expect(
      describeImportFailure(
        {
          message: "The CSV has 3 problem(s), nothing was imported. ...",
          problems: [
            { line: 2, code: "invalid_date", column: "valid_from" },
            { line: 1, code: "too_many_rows", max: 50000 },
            { line: 7, code: "code_already_stored" },
          ],
          problem_count: 3,
        },
        format
      )
    ).toEqual({
      problems: [
        { key: "import.problems.invalid_date", values: { line: "#2", column: "valid_from" } },
        { key: "import.problems.too_many_rows", values: { line: "#1", max: "#50000" } },
        { key: "import.problems.code_already_stored", values: { line: "#7" } },
      ],
      more: 0,
    })
  })

  it("counts the problems the response did not list", () => {
    expect(
      describeImportFailure(
        {
          message: "The CSV has 25 problem(s), nothing was imported. ...; and 5 more",
          problems: Array.from({ length: 20 }, (_, index) => ({ line: index + 2, code: "empty_code" })),
          problem_count: 25,
        },
        format
      )
    ).toEqual(expect.objectContaining({ more: 5 }))
  })

  it("shows the message alone for an error without problems", () => {
    expect(describeImportFailure({ message: "Voucher product vprod_1 was not found" }, format)).toEqual({
      message: "Voucher product vprod_1 was not found",
    })
  })

  it("shows the message alone when a problem's code is not one the admin translates", () => {
    expect(
      describeImportFailure(
        {
          message: "The CSV has 2 problem(s), nothing was imported. ...",
          problems: [
            { line: 2, code: "empty_code" },
            { line: 3, code: "added_by_a_newer_server" },
          ],
          problem_count: 2,
        },
        format
      )
    ).toEqual({ message: "The CSV has 2 problem(s), nothing was imported. ..." })
  })
})
