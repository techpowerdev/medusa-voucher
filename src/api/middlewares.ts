import { defineMiddlewares } from "@medusajs/framework/http"
import { voucherBatchMiddlewares } from "./admin/voucher-batches/middlewares"

export default defineMiddlewares({
  routes: [...voucherBatchMiddlewares],
})
