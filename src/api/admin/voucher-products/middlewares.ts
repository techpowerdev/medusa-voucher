import {
  MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

export const CreateVoucherProductSchema = z.object({
  variant_id: z.string().min(1),
  face_value: z.number().positive(),
  currency_code: z
    .string()
    .length(3)
    .transform((code) => code.toLowerCase()),
})

export const ListVoucherProductsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ListVoucherProductsQuery = z.infer<typeof ListVoucherProductsSchema>

export const UpdateVoucherProductSchema = z
  .object({
    face_value: z.number().positive().optional(),
    currency_code: z
      .string()
      .length(3)
      .transform((code) => code.toLowerCase())
      .optional(),
  })
  .refine((body) => body.face_value !== undefined || body.currency_code !== undefined, {
    message: "Give a face_value or a currency_code to change",
  })

export type UpdateVoucherProductBody = z.infer<typeof UpdateVoucherProductSchema>

export type CreateVoucherProductBody = z.infer<typeof CreateVoucherProductSchema>

export const voucherProductMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/voucher-products/:id",
    method: "POST",
    middlewares: [validateAndTransformBody(UpdateVoucherProductSchema)],
  },
  {
    matcher: "/admin/voucher-products",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(ListVoucherProductsSchema, {
        isList: true,
        defaults: ["id"],
      }),
    ],
  },
  {
    matcher: "/admin/voucher-products",
    method: "POST",
    middlewares: [validateAndTransformBody(CreateVoucherProductSchema)],
  },
]
