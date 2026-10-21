import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"
import { AllocateVouchersInput } from "../../modules/voucher/types"

// No compensation: the service allocates everything in one transaction or nothing, and
// nothing runs after this step.
export const allocateVouchersStep = createStep(
  "allocate-vouchers",
  async (input: AllocateVouchersInput, { container }) => {
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)

    return new StepResponse(
      input.lines.length
        ? await service.allocateVouchers(input)
        : { allocated: [], failures: [] }
    )
  }
)
