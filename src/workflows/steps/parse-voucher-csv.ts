import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"

// Lines listed in the error message; the rest are summarised so it stays readable.
const MAX_REPORTED_ERRORS = 20

export const parseVoucherCsvStep = createStep(
  "parse-voucher-csv",
  async (input: { csv: string }, { container }) => {
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    const { vouchers, errors } = await service.parseVoucherCsv(input.csv)

    if (errors.length) {
      const listed = errors
        .slice(0, MAX_REPORTED_ERRORS)
        .map(({ line, message }) => `line ${line}: ${message}`)
      const more = errors.length - listed.length

      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `The CSV has ${errors.length} problem(s), nothing was imported. ${listed.join("; ")}${
          more > 0 ? `; and ${more} more` : ""
        }`
      )
    }

    return new StepResponse(vouchers)
  }
)
