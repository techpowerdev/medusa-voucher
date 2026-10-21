export type VoucherModuleOptions = {
  /**
   * Secret from which the keys that encrypt voucher codes and PINs and the keys that
   * hash codes for duplicate detection are derived. At least 32 characters; generate
   * one with `openssl rand -base64 32`. Losing or changing it makes stored codes unreadable.
   */
  encryptionKey: string
}
