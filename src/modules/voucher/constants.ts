export const VOUCHER_STATUSES = [
  "available",
  "allocated",
  "delivered",
  "expired",
  "void",
] as const

export type VoucherStatus = (typeof VOUCHER_STATUSES)[number]

export const DELIVERY_STATUSES = ["pending", "delivered", "failed"] as const

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export const ALLOCATION_FAILURE_STATUSES = ["open", "resolved"] as const

export type AllocationFailureStatus =
  (typeof ALLOCATION_FAILURE_STATUSES)[number]
