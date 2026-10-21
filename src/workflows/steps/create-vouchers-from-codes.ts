import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"
import { VoucherCodeInput } from "../../modules/voucher/types"

// No compensation: the service stores every voucher in one insert, so a failure creates
// none, and the batch step that precedes this one is rolled back by the workflow.
export const createVouchersFromCodesStep = createStep(
  "create-vouchers-from-codes",
  async (
    input: { batch_id: string; vouchers: VoucherCodeInput[] },
    { container }
  ) => {
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    const created = await service.createVouchersFromCodes(input)

    return new StepResponse(created.length)
  }
)
