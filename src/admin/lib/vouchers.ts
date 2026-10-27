import type { AllocationFailureStatus } from "../../modules/voucher/constants"
import type { PoolCounts, PoolStatus } from "../../modules/voucher/types"
import { backendUrl, sdk } from "./client"
import type { ImportFailure, ImportProblem } from "./import-problems"
import type { ImportAllocationRetry } from "./import-allocation-retry"

export { POOL_STATUSES } from "../../modules/voucher/types"
export { ALLOCATION_FAILURE_RESOLVED_BY_SYSTEM, AllocationFailureStatus } from "../../modules/voucher/constants"
export type { PoolCounts, PoolStatus }

// The translation namespace of the plugin's admin pages.
export const VOUCHER_NS = "medusa-voucher"

export type VoucherProduct = {
  id: string
  face_value: number
  currency_code: string
  product_variant: { id: string; title: string; product: { id: string; title: string } }
  counts: PoolCounts
  // Orders waiting for this Voucher product's Vouchers (an open Allocation failure).
  open_allocation_failures: number
}

export type VoucherBatch = {
  id: string
  purchased_at: string
  // The calendar day of `purchased_at` in the plugin's time zone, as YYYY-MM-DD.
  purchased_day: string
  unit_cost: number | null
  reference: string | null
  redemption_instructions: string | null
  counts: PoolCounts
}

export type PoolVoucher = {
  id: string
  status: PoolStatus
  code_hint: string
  batch: { id: string; reference: string | null; purchased_day: string }
  first_day: string | null
  last_day: string | null
  order: { id: string; display_id: number } | null
}

type Page = { limit: number; offset: number }

export const listVoucherProducts = (page: Page) =>
  sdk.client.fetch<{ voucher_products: VoucherProduct[]; count: number }>("/admin/voucher-products", {
    query: page,
  })

export const retrieveVoucherProduct = (id: string) =>
  sdk.client.fetch<{ voucher_product: VoucherProduct }>(`/admin/voucher-products/${id}`)

export const listVoucherBatches = (id: string, page: Page) =>
  sdk.client.fetch<{ batches: VoucherBatch[]; count: number }>(`/admin/voucher-products/${id}/batches`, {
    query: page,
  })

export const listPoolVouchers = (
  id: string,
  query: Page & { status?: PoolStatus; batch_id?: string }
) =>
  sdk.client.fetch<{ vouchers: PoolVoucher[]; count: number }>(`/admin/voucher-products/${id}/vouchers`, {
    query,
  })

// An order's open Allocation failures: one per line it is short of, so one page holds them all.
export const listOrderAllocationFailures = (orderId: string) =>
  sdk.client.fetch<{ voucher_allocation_failures: AllocationFailure[]; count: number }>(
    "/admin/voucher-allocation-failures",
    { query: { order_id: orderId, status: "open", limit: 100 } }
  )

// The Voucher product a variant is marked as, if any, read through the variant's link.
export const retrieveVariantVoucherProductId = async (productId: string, variantId: string) => {
  const { variant } = await sdk.admin.product.retrieveVariant(productId, variantId, {
    fields: "id,voucher_product.id",
  })

  return (variant as { voucher_product?: { id: string } | null }).voucher_product?.id ?? null
}

export type VoucherProductBody = { face_value: number; currency_code: string }

export const createVoucherProduct = (body: VoucherProductBody & { variant_id: string }) =>
  sdk.client.fetch<{ voucher_product: { id: string } }>("/admin/voucher-products", {
    method: "POST",
    body,
  })

export const updateVoucherProduct = (id: string, body: VoucherProductBody) =>
  sdk.client.fetch<{ voucher_product: { id: string } }>(`/admin/voucher-products/${id}`, {
    method: "POST",
    body,
  })

export type ImportVoucherBatchBody = {
  voucher_product_id: string
  purchased_at: string
  unit_cost?: number | null
  reference?: string | null
  redemption_instructions?: string | null
  csv: string
}

// A refused import, with the problems the response lists.
export class ImportVoucherBatchError extends Error implements ImportFailure {
  constructor(
    message: string,
    readonly problems?: ImportProblem[],
    readonly problem_count?: number
  ) {
    super(message)
  }
}

// The sdk keeps only the message of an error response, so this request goes through the
// browser's fetch to read the problems of a refused file. It sends what the sdk would: the
// same base URL, the session cookie and JSON headers.
export const importVoucherBatch = async (body: ImportVoucherBatchBody) => {
  const response = await fetch(`${backendUrl.replace(/\/$/, "")}/admin/voucher-batches/import`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(sdk.client.locale ? { "x-medusa-locale": sdk.client.locale } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new ImportVoucherBatchError(data.message ?? response.statusText, data.problems, data.problem_count)
  }

  return data as {
    voucher_batch: { id: string }
    imported: number
    allocation_retry: ImportAllocationRetry
  }
}

// The import refuses a file with more rows than this: MAX_CSV_VOUCHERS, kept here so the admin
// bundle does not take in the server's CSV parser.
export const MAX_IMPORT_ROWS = 50_000

export const statusColor: Record<PoolStatus, "green" | "red" | "orange" | "blue" | "purple" | "grey"> = {
  available: "green",
  expired: "red",
  under_minimum: "orange",
  allocated: "blue",
  delivered: "purple",
  void: "grey",
}

// An Allocation failure as the admin API lists it; `display_id` and `email` are the order's.
export type AllocationFailure = {
  id: string
  order_id: string
  order_line_item_id: string
  voucher_product_id: string | null
  display_id: number | null
  email: string | null
  quantity_requested: number
  quantity_available: number
  status: AllocationFailureStatus
  resolved_at: string | null
  // The admin user who resolved it, or `system` when its order got its Vouchers.
  resolved_by: string | null
  resolution_note: string | null
  created_at: string
}

export const listAllocationFailures = (
  voucherProductId: string,
  query: Page & { status?: AllocationFailureStatus }
) =>
  sdk.client.fetch<{ voucher_allocation_failures: AllocationFailure[]; count: number }>(
    "/admin/voucher-allocation-failures",
    { query: { ...query, voucher_product_id: voucherProductId } }
  )
