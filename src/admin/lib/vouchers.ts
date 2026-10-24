import type { PoolCounts, PoolStatus } from "../../modules/voucher/types"
import { sdk } from "./client"

export { POOL_STATUSES } from "../../modules/voucher/types"
export type { PoolCounts, PoolStatus }

// The translation namespace of the plugin's admin pages.
export const VOUCHER_NS = "medusa-voucher"

export type VoucherProduct = {
  id: string
  face_value: number
  currency_code: string
  product_variant: { id: string; title: string; product: { id: string; title: string } }
  counts: PoolCounts
}

export type VoucherBatch = {
  id: string
  purchased_at: string
  unit_cost: number | null
  reference: string | null
  redemption_instructions: string | null
  counts: PoolCounts
}

export type PoolVoucher = {
  id: string
  status: PoolStatus
  code_hint: string
  batch: { id: string; reference: string | null }
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

export type ImportVoucherBatchBody = {
  voucher_product_id: string
  purchased_at: string
  unit_cost?: number | null
  reference?: string | null
  redemption_instructions?: string | null
  csv: string
}

export const importVoucherBatch = (body: ImportVoucherBatchBody) =>
  sdk.client.fetch<{ voucher_batch: { id: string }; imported: number }>("/admin/voucher-batches/import", {
    method: "POST",
    body,
  })

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
