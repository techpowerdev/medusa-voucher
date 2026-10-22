export enum VoucherStatus {
  AVAILABLE = "available",
  ALLOCATED = "allocated",
  DELIVERED = "delivered",
  EXPIRED = "expired",
  VOID = "void",
}

export enum DeliveryStatus {
  PENDING = "pending",
  DELIVERED = "delivered",
  FAILED = "failed",
}

export enum AllocationFailureStatus {
  OPEN = "open",
  RESOLVED = "resolved",
}

// `resolved_by` of an Allocation failure closed because its order was allocated.
export const ALLOCATION_FAILURE_RESOLVED_BY_SYSTEM = "system"
