import { MedusaError } from "@medusajs/framework/utils"
import { VoucherImportProblemCode } from "../constants"

// One reason an import refused a file: its line, a stable code and, for some codes, the
// column or the row limit. Never a code or PIN.
export type VoucherImportProblem = {
  line: number
  code: VoucherImportProblemCode
  column?: string
  max?: number
}

/**
 * An INVALID_DATA error that also lists the file's problems, so the import route can return
 * them for the admin to translate. The message stays the readable summary.
 */
export class VoucherImportError extends MedusaError {
  problems: VoucherImportProblem[]

  constructor(message: string, problems: VoucherImportProblem[]) {
    super(MedusaError.Types.INVALID_DATA, message)
    this.problems = problems
  }
}
