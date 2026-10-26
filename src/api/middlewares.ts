import { defineMiddlewares } from "@medusajs/framework/http"
import { allocationFailureMiddlewares } from "./admin/voucher-allocation-failures/middlewares"
import { voucherBatchMiddlewares } from "./admin/voucher-batches/middlewares"
import { voucherProductMiddlewares } from "./admin/voucher-products/middlewares"
import { customerVoucherMiddlewares } from "./store/customers/me/vouchers/middlewares"

export default defineMiddlewares({
  routes: [...allocationFailureMiddlewares, ...voucherBatchMiddlewares, ...voucherProductMiddlewares, ...customerVoucherMiddlewares],
})
