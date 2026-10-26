import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VOUCHER_MODULE } from "../../../../../modules/voucher"
import VoucherModuleService from "../../../../../modules/voucher/service"
import { customerVoucherViews } from "./customer-voucher-view"
import { ListCustomerVouchersQuery } from "./middlewares"

// A page of the signed-in customer's own Vouchers, newest first. Never a code: only its hint.
export const GET = async (
  req: AuthenticatedMedusaRequest<unknown, ListCustomerVouchersQuery>,
  res: MedusaResponse
) => {
  const service: VoucherModuleService = req.scope.resolve(VOUCHER_MODULE)
  const { skip = 0, take = 20 } = req.queryConfig.pagination
  const [vouchers, count] = await service.listCustomerVouchers({
    customer_id: req.auth_context.actor_id,
    order_id: req.validatedQuery.order_id,
    skip,
    take,
  })

  res.json({
    vouchers: await customerVoucherViews(req.scope, vouchers),
    count,
    limit: take,
    offset: skip,
  })
}
