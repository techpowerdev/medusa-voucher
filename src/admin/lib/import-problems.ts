import { VoucherImportProblemCode } from "../../modules/voucher/constants"

const TRANSLATED = new Set<string>(Object.values(VoucherImportProblemCode))

// A problem of a refused import, as `POST /admin/voucher-batches/import` returns it. The code
// is kept a string: a newer server may send one this admin does not know.
export type ImportProblem = {
  line: number
  code: string
  column?: string
  max?: number
}

export type ImportFailure = {
  message: string
  problems?: ImportProblem[]
  problem_count?: number
}

export type ImportFailureView =
  | { problems: { key: string; values: Record<string, string> }[]; more: number }
  | { message: string }

/**
 * What the import dialog shows for a refused import: each problem as its translation key and
 * values, with numbers formatted for the admin's language, or the message alone for an error
 * without problems or with a problem the admin has no translation for.
 */
export const describeImportFailure = (
  failure: ImportFailure,
  format: (value: number) => string
): ImportFailureView => {
  const problems = failure.problems

  if (!problems?.length || problems.some(({ code }) => !TRANSLATED.has(code))) {
    return { message: failure.message }
  }

  return {
    problems: problems.map(({ code, line, max, ...values }) => ({
      key: `import.problems.${code}`,
      values: { line: format(line), ...(max === undefined ? {} : { max: format(max) }), ...values },
    })),
    // The response lists the first problems only.
    more: (failure.problem_count ?? problems.length) - problems.length,
  }
}
