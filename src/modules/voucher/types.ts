export type VoucherModuleOptions = {
  /**
   * Secret from which the keys that encrypt voucher codes and PINs and the keys that
   * hash codes for duplicate detection are derived. At least 32 characters; generate
   * one with `openssl rand -base64 32`. Losing or changing it makes stored codes unreadable.
   */
  encryptionKey: string
  /**
   * IANA time zone in which a date without a time (a CSV's `valid_from` / `valid_until`)
   * is read as a whole day. Defaults to "Asia/Bangkok". Dates already imported keep their
   * instants when it changes.
   */
  timezone?: string
  /**
   * How many whole days of validity a Voucher must still have, counted from the later of
   * now and its valid-from date, to be allocated to an order. Defaults to 0 (no minimum;
   * expired Vouchers are never allocated either way).
   */
  minimumRemainingValidityDays?: number
}

export type VoucherCodeInput = {
  code: string
  pin?: string | null
  // The voucher is valid from `valid_from` up to, not including, `valid_until`.
  valid_from?: Date | null
  valid_until?: Date | null
  // Line of the source file (for example a CSV row) this voucher came from. When given,
  // errors name it instead of the position in the input.
  source_line?: number
}

export type AllocateVouchersLine = {
  order_line_item_id: string
  variant_id: string
  quantity: number
}

export type AllocateVouchersInput = {
  order_id: string
  customer_id?: string | null
  recipient_email?: string | null
  lines: AllocateVouchersLine[]
}

export type AllocatedVoucher = {
  allocation_id: string
  voucher_id: string
  order_line_item_id: string
  unit_index: number
}

export type AllocationShortfall = {
  order_line_item_id: string
  variant_id: string
  requested: number
  available: number
}

export type AllocateVouchersResult = {
  allocated: AllocatedVoucher[]
  failures: AllocationShortfall[]
}
