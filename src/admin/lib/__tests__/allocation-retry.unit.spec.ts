import { describeRetryResult } from "../allocation-retry"

const format = (value: number) => `#${value}`

describe("describeRetryResult", () => {
  it("counts the orders served, still waiting and not tried, as a success when every order was served", () => {
    expect(
      describeRetryResult({ allocated: ["order_1", "order_2"], still_open: [], failed: [] }, format)
    ).toEqual({
      variant: "success",
      key: "failures.retry.result",
      values: { allocated: "#2", still_open: "#0", failed: "#0" },
    })
  })

  it("warns when an order still waits or could not be tried", () => {
    expect(describeRetryResult({ allocated: ["order_1"], still_open: ["order_2"], failed: [] }, format)).toEqual(
      expect.objectContaining({ variant: "warning", values: { allocated: "#1", still_open: "#1", failed: "#0" } })
    )
    expect(describeRetryResult({ allocated: [], still_open: [], failed: ["order_3"] }, format)).toEqual(
      expect.objectContaining({ variant: "warning", values: { allocated: "#0", still_open: "#0", failed: "#1" } })
    )
  })

  it("says no order was waiting when the retry had none to try", () => {
    expect(describeRetryResult({ allocated: [], still_open: [], failed: [] }, format)).toEqual({
      variant: "success",
      key: "failures.retry.noneWaiting",
      values: {},
    })
  })
})
