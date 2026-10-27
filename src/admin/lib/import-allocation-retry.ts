// The retry of the Voucher product's waiting orders that `POST /admin/voucher-batches/import`
// runs after storing the batch (order ids), or null when it did not run.
export type ImportAllocationRetry = {
  allocated: string[]
  still_open: string[]
  failed: string[]
} | null

export type ImportAllocationRetryView = {
  level: "info" | "warning"
  lines: { key: string; values: Record<string, string> }[]
}

/**
 * What the import dialog adds to its success message about the waiting orders: how many were
 * served, still wait or could not be tried, as translation keys with numbers formatted for the
 * admin's language; a warning when the retry did not run; nothing when no order was waiting.
 */
export const describeImportAllocationRetry = (
  retry: ImportAllocationRetry,
  format: (value: number) => string
): ImportAllocationRetryView | undefined => {
  if (!retry) {
    return { level: "warning", lines: [{ key: "import.retry.notRun", values: {} }] }
  }

  const { allocated, still_open, failed } = retry

  if (!allocated.length && !still_open.length && !failed.length) {
    return undefined
  }

  const lines: ImportAllocationRetryView["lines"] = [
    { key: "import.retry.served", values: { allocated: format(allocated.length) } },
  ]

  if (still_open.length) {
    lines.push({ key: "import.retry.stillOpen", values: { stillOpen: format(still_open.length) } })
  }

  if (failed.length) {
    lines.push({ key: "import.retry.failed", values: { failed: format(failed.length) } })
  }

  return { level: failed.length ? "warning" : "info", lines }
}
