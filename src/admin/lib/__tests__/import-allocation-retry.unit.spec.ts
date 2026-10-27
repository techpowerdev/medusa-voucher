import { describeImportAllocationRetry } from "../import-allocation-retry"

const format = (value: number) => `#${value}`

describe("describeImportAllocationRetry", () => {
  it("says how many waiting orders the import served and how many still wait", () => {
    expect(
      describeImportAllocationRetry(
        { allocated: ["order_1", "order_2"], still_open: ["order_3"], failed: [] },
        format
      )
    ).toEqual({
      level: "info",
      lines: [
        { key: "import.retry.served", values: { allocated: "#2" } },
        { key: "import.retry.stillOpen", values: { stillOpen: "#1" } },
      ],
    })
  })

  it("warns about orders that could not be tried", () => {
    expect(
      describeImportAllocationRetry({ allocated: [], still_open: [], failed: ["order_1"] }, format)
    ).toEqual({
      level: "warning",
      lines: [
        { key: "import.retry.served", values: { allocated: "#0" } },
        { key: "import.retry.failed", values: { failed: "#1" } },
      ],
    })
  })

  it("says nothing when no order was waiting", () => {
    expect(
      describeImportAllocationRetry({ allocated: [], still_open: [], failed: [] }, format)
    ).toBeUndefined()
  })

  it("warns that the retry did not run", () => {
    expect(describeImportAllocationRetry(null, format)).toEqual({
      level: "warning",
      lines: [{ key: "import.retry.notRun", values: {} }],
    })
  })
})
