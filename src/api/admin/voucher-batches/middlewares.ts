import {
  MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { ISO_DATE, parseCalendarDate } from "../../../modules/voucher/utils/parse-voucher-csv"

export const ImportVoucherBatchSchema = z.object({
  voucher_product_id: z.string().min(1),
  unit_cost: z.number().nonnegative().nullish(),
  // A day alone (YYYY-MM-DD) stays text: it means the start of that day in the plugin's time
  // zone, which the workflow knows. Anything else is read as an instant.
  purchased_at: z
    .union([z.string().regex(ISO_DATE), z.coerce.date()])
    .refine((value) => typeof value !== "string" || parseCalendarDate(value) !== null, {
      message: "purchased_at must be a day on the calendar as YYYY-MM-DD, or a date and time",
    }),
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
