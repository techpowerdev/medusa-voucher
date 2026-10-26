import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"

export type ResolveAllocationFailureInput = { id: string; note: string; resolved_by: string }

// No compensation: the failure is the only change, and nothing runs after this step.
export const resolveVoucherAllocationFailureStep = createStep(
  "resolve-voucher-allocation-failure",
  async (input: ResolveAllocationFailureInput, { container }) => {
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)

    return new StepResponse(await service.resolveAllocationFailure(input))
  }
)
