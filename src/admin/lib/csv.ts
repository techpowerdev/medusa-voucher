// The number of data rows in a CSV file's text, shown before importing it: its non-blank
// lines after the header, as the import skips blank lines. A quoted value spanning lines
// would be counted twice, which Voucher codes never do; the import counts the file itself.
export const countCsvRows = (text: string): number => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "")

  return Math.max(lines.length - 1, 0)
}
