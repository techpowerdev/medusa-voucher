import { defineMiddlewares } from "@medusajs/framework/http"
import { allocationFailureMiddlewares } from "./admin/voucher-allocation-failures/middlewares"
import { voucherBatchMiddlewares } from "./admin/voucher-batches/middlewares"
import { voucherProductMiddlewares } from "./admin/voucher-products/middlewares"

export default defineMiddlewares({
  routes: [...allocationFailureMiddlewares, ...voucherBatchMiddlewares, ...voucherProductMiddlewares],
})
