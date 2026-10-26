import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { VOUCHER_MODULE } from "../../modules/voucher"
import VoucherModuleService from "../../modules/voucher/service"
import { ISO_DATE } from "../../modules/voucher/utils/parse-voucher-csv"

export type CreateVoucherBatchStepInput = {
  voucher_product_id: string
  variant_id: string
  unit_cost?: number | null
  /** An instant, or a calendar day as `YYYY-MM-DD` meaning its start in the plugin's time zone. */
  purchased_at: Date | string
  reference?: string | null
  redemption_instructions?: string | null
  imported_by?: string | null
}

export const createVoucherBatchStep = createStep(
  "create-voucher-batch",
  async ({ purchased_at, ...input }: CreateVoucherBatchStepInput, { container }) => {
    const service: VoucherModuleService = container.resolve(VOUCHER_MODULE)
    // Workflow input is stored as JSON, so an instant can arrive here as text too: only a day
    // alone is a calendar day.
    const purchasedAt =
      typeof purchased_at === "string" && ISO_DATE.test(purchased_at)
        ? await service.startOfCalendarDay(purchased_at)
        : new Date(purchased_at)
    const batch = await service.createVoucherBatches({ ...input, purchased_at: purchasedAt })

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
