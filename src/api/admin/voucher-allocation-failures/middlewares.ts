import {
  MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { AllocationFailureStatus } from "../../../modules/voucher/constants"

export const ListAllocationFailuresSchema = z.object({
  status: z.nativeEnum(AllocationFailureStatus).default(AllocationFailureStatus.OPEN),
  voucher_product_id: z.string().min(1).optional(),
  order_id: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ListAllocationFailuresQuery = z.infer<typeof ListAllocationFailuresSchema>

export const ResolveAllocationFailureSchema = z.object({
  note: z.string().trim().min(1),
})

export type ResolveAllocationFailureBody = z.infer<typeof ResolveAllocationFailureSchema>

export const allocationFailureMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/voucher-allocation-failures/:id/resolve",
    method: "POST",
    middlewares: [validateAndTransformBody(ResolveAllocationFailureSchema)],
  },
  {
    matcher: "/admin/voucher-allocation-failures",
    method: "GET",
    middlewares: [
      validateAndTransformQuery(ListAllocationFailuresSchema, {
        isList: true,
        defaults: ["id"],
      }),
    ],
  },
]
