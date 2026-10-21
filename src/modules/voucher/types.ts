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
