import { MiddlewareRoute, validateAndTransformQuery } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

// Medusa already requires a signed-in customer on /store/customers/me*.
export const ListCustomerVouchersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  order_id: z.string().min(1).optional(),
})

export type ListCustomerVouchersQuery = z.infer<typeof ListCustomerVouchersSchema>

export const customerVoucherMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/store/customers/me/vouchers",
    method: "GET",
    middlewares: [validateAndTransformQuery(ListCustomerVouchersSchema, { isList: true, defaults: ["id"] })],
  },
]
