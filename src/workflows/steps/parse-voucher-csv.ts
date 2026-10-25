import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"
import { VoucherImportError } from "../../modules/voucher/utils/import-error"

// Problems listed in the error message and in the import's response; the rest are counted.
export const MAX_REPORTED_IMPORT_PROBLEMS = 20

export const parseVoucherCsvStep = createStep(
  "parse-voucher-csv",
  async (input: { csv: string }, { container }) => {
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    const { vouchers, errors } = await service.parseVoucherCsv(input.csv)

    if (errors.length) {
      const listed = errors
        .slice(0, MAX_REPORTED_IMPORT_PROBLEMS)
        .map(({ line, message }) => `line ${line}: ${message}`)
      const more = errors.length - listed.length

      throw new VoucherImportError(
        `The CSV has ${errors.length} problem(s), nothing was imported. ${listed.join("; ")}${
          more > 0 ? `; and ${more} more` : ""
        }`,
        errors.map(({ message: _message, ...problem }) => problem)
      )
    }

    return new StepResponse(vouchers)
  }
)
