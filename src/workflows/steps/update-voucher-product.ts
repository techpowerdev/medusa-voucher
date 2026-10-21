import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"

export type UpdateVoucherProductStepInput = {
  id: string
  face_value?: number
  currency_code?: string
}

export const updateVoucherProductStep = createStep(
  "update-voucher-product",
  async (input: UpdateVoucherProductStepInput, { container }) => {
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    const before = await service.retrieveVoucherProduct(input.id)
    const updated = await service.updateVoucherProducts(input)

    return new StepResponse(updated, {
      id: before.id,
      face_value: Number(before.face_value),
      currency_code: before.currency_code,
    })
  },
  async (before, { container }) => {
    if (!before) {
      return
    }

    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    await service.updateVoucherProducts(before)
  }
)
