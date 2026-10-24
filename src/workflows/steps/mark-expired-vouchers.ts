import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"

export const markExpiredVouchersStep = createStep(
  "mark-expired-vouchers",
  async (input: { now: string }, { container }) => {
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    const expired = await service.markExpiredVouchers({ now: new Date(input.now) })

    if (expired) {
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .info(`@khumkha/medusa-voucher: marked ${expired} Vouchers as Expired`)
    }

    // An ended Validity period never comes back, so there is nothing to undo.
    return new StepResponse({ expired })
  }
)
