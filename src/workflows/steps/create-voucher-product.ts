import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"

export type CreateVoucherProductStepInput = {
  face_value: number
  currency_code: string
}

export const createVoucherProductStep = createStep(
  "create-voucher-product",
  async (input: CreateVoucherProductStepInput, { container }) => {
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    const voucherProduct = await service.createVoucherProducts(input)

    return new StepResponse(voucherProduct, voucherProduct.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }

    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    await service.deleteVoucherProducts(id)
  }
)
