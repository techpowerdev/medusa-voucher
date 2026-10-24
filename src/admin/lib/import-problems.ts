// The import reports "The CSV has N problem(s), nothing was imported. line 3: ...; line 7: ..."
// with line numbers and never a code; each problem is shown on its own line. Any other error is
// shown as it is.
export const importProblems = (message: string) => {
  const start = message.search(/line \d+:/)

  return start < 0
    ? { summary: message, lines: [] as string[] }
    : { summary: message.slice(0, start).trim(), lines: message.slice(start).split("; ") }
}
