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
