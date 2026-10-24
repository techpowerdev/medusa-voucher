import { importProblems } from "../import-problems"

describe("importProblems", () => {
  it("splits the import's message into its summary and one problem per line", () => {
    expect(
      importProblems(
        "The CSV has 2 problem(s), nothing was imported. line 2: valid_until must be a date as YYYY-MM-DD or DD-MM-YYYY; line 5: The code is empty"
      )
    ).toEqual({
      summary: "The CSV has 2 problem(s), nothing was imported.",
      lines: [
        "line 2: valid_until must be a date as YYYY-MM-DD or DD-MM-YYYY",
        "line 5: The code is empty",
      ],
    })
  })

  it("keeps the count of problems not listed as its own line", () => {
    expect(
      importProblems("The CSV has 30 problem(s), nothing was imported. line 2: The code is empty; and 29 more")
        .lines
    ).toEqual(["line 2: The code is empty", "and 29 more"])
  })

  it("shows any other error as its summary alone", () => {
    expect(importProblems("Voucher product vprod_1 was not found")).toEqual({
      summary: "Voucher product vprod_1 was not found",
      lines: [],
    })
  })
})
