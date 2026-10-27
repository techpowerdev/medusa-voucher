// What `POST /admin/voucher-products/:id/retry-allocation-failures` returns: order ids.
export type RetryAllocationFailuresResult = {
  allocated: string[]
  still_open: string[]
  failed: string[]
}

export type RetryResultView = {
  variant: "success" | "warning"
  key: string
  values: Record<string, string>
}

/**
 * What the Voucher product page tells after a retry: how many orders got their Vouchers, still
 * wait and could not be tried, with numbers formatted for the admin's language, or that no
 * order was waiting.
 */
export const describeRetryResult = (
  result: RetryAllocationFailuresResult,
  format: (value: number) => string
): RetryResultView => {
  const { allocated, still_open, failed } = result

  if (!allocated.length && !still_open.length && !failed.length) {
    return { variant: "success", key: "failures.retry.noneWaiting", values: {} }
  }

  return {
    // Orders left waiting or not tried still need someone to act.
    variant: still_open.length || failed.length ? "warning" : "success",
    key: "failures.retry.result",
    values: {
      allocated: format(allocated.length),
      still_open: format(still_open.length),
      failed: format(failed.length),
    },
  }
}
