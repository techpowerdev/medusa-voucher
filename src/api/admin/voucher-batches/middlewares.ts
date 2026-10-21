import {
  MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

export const ImportVoucherBatchSchema = z.object({
  partner: z.string().trim().min(1),
  variant_id: z.string().min(1),
  face_value: z.number().positive(),
  currency_code: z
    .string()
    .length(3)
    .transform((code) => code.toLowerCase()),
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
    middlewares: [validateAndTransformBody(ImportVoucherBatchSchema)],
  },
]
