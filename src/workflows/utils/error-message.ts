// The reason of an error for a log line. A failed workflow run rejects with the step's error
// as a plain object, not an Error, so `instanceof Error` alone would log "[object Object]".
export function errorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message

  return typeof message === "string" ? message : String(error)
}
