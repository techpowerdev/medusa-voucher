import { defineMiddlewares } from "@medusajs/framework/http"
import { voucherBatchMiddlewares } from "./admin/voucher-batches/middlewares"
import { voucherProductMiddlewares } from "./admin/voucher-products/middlewares"

export default defineMiddlewares({
  routes: [...voucherBatchMiddlewares, ...voucherProductMiddlewares],
})
