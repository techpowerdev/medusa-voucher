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

// Events the plugin emits; subscribers in the host application may listen to them too.
export enum VoucherEvents {
  // An allocation created new Allocations for an order. Data: `{ order_id }`.
  ALLOCATED = "voucher.allocated",
}

// Why an import refused a file, one per problem with its line. Stable: the admin translates
// each and API clients may match on it. A problem never carries a code or PIN.
export enum VoucherImportProblemCode {
  INVALID_CSV_ROW = "invalid_csv_row",
  NO_ROWS = "no_rows",
  MISSING_CODE_COLUMN = "missing_code_column",
  UNKNOWN_COLUMN = "unknown_column",
  TOO_MANY_ROWS = "too_many_rows",
  EMPTY_CODE = "empty_code",
  INVALID_DATE = "invalid_date",
  PERIOD_ENDS_BEFORE_START = "period_ends_before_start",
  CODE_REPEATED_IN_FILE = "code_repeated_in_file",
  CODE_ALREADY_STORED = "code_already_stored",
}
