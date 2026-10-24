import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VOUCHER_MODULE } from "../../../../../modules/voucher"
import VoucherModuleService from "../../../../../modules/voucher/service"
import { emptyPoolCounts } from "../../../../../modules/voucher/types"
import { voucherProductVariantId } from "../../voucher-product-variant"

// A Voucher product's batches, newest purchase first, each with its Pool counted by status.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await voucherProductVariantId(req.scope, req.params.id)
  const service: VoucherModuleService = req.scope.resolve(VOUCHER_MODULE)
  const { skip = 0, take = 20 } = req.queryConfig.pagination
  const [batches, count] = await service.listAndCountVoucherBatches(
    { voucher_product_id: req.params.id },
    {
      select: ["id", "purchased_at", "unit_cost", "reference", "redemption_instructions"],
      order: { purchased_at: "DESC", id: "DESC" },
      skip,
      take,
    }
  )
  const counts = await service.countPool("batch", batches.map((batch) => batch.id))

  res.json({
    batches: batches.map((batch) => ({
      id: batch.id,
      purchased_at: batch.purchased_at,
      unit_cost: batch.unit_cost === null ? null : Number(batch.unit_cost),
      reference: batch.reference,
      redemption_instructions: batch.redemption_instructions,
      counts: counts.get(batch.id) ?? emptyPoolCounts(),
    })),
    count,
    limit: take,
    offset: skip,
  })
}
