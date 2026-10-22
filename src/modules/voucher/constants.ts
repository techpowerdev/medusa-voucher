export enum VoucherStatus {
  AVAILABLE = "available",
  ALLOCATED = "allocated",
  DELIVERED = "delivered",
  EXPIRED = "expired",
  VOID = "void",
}

// The state of one order's Delivery on one channel.
export enum DeliveryStatus {
  PENDING = "pending",
  SENDING = "sending",
  DELIVERED = "delivered",
  FAILED = "failed",
}

// How a Delivery reaches the customer; LINE is planned (see the delivery spec).
export enum DeliveryChannel {
  EMAIL = "email",
}

export enum AllocationFailureStatus {
  OPEN = "open",
  RESOLVED = "resolved",
}

// `resolved_by` of an Allocation failure closed because its order was allocated.
export const ALLOCATION_FAILURE_RESOLVED_BY_SYSTEM = "system"
