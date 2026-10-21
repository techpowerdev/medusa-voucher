import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"

export type CreateVoucherBatchStepInput = {
  voucher_product_id: string
  variant_id: string
  unit_cost?: number | null
  purchased_at: Date
  reference?: string | null
  redemption_instructions?: string | null
  imported_by?: string | null
}

export const createVoucherBatchStep = createStep(
  "create-voucher-batch",
  async (input: CreateVoucherBatchStepInput, { container }) => {
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    const batch = await service.createVoucherBatches(input)

    return new StepResponse(batch, batch.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }

    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    await service.deleteVoucherBatches(id)
  }
)
