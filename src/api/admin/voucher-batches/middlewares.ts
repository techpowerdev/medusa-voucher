import {
  MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

export const ImportVoucherBatchSchema = z.object({
  voucher_product_id: z.string().min(1),
  unit_cost: z.number().nonnegative().nullish(),
  purchased_at: z.coerce.date(),
  reference: z.string().nullish(),
  redemption_instructions: z.string().nullish(),
  // The CSV file's text; the admin reads the chosen file and sends its content.
  csv: z.string().min(1),
})

export type ImportVoucherBatchBody = z.infer<typeof ImportVoucherBatchSchema>

export const voucherBatchMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/voucher-batches/import",
    method: "POST",
    // The CSV comes in the JSON body: up to MAX_CSV_VOUCHERS rows of about 200 bytes, far over
    // the default 100 KB.
    bodyParser: { sizeLimit: "10mb" },
    middlewares: [validateAndTransformBody(ImportVoucherBatchSchema)],
  },
]
