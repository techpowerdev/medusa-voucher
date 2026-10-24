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
  delivery?: {
    /**
     * Sends an order's Vouchers on its own once they are allocated. Defaults to true. When
     * false, nothing is sent and no Delivery is created until `deliverOrderVouchersWorkflow`
     * is called.
     */
    automatic?: boolean
    /**
     * Replaces the plugin's default email (English) with the store's own, per channel. It
     * receives the order and its Vouchers with their codes and returns the subject, HTML
     * and plain text. Refer to each Voucher's QR code in the HTML as `cid:<qr_code_cid>`,
     * and keep the codes as text so a blocked image never hides them.
     */
    renderers?: {
      email?: VoucherEmailRenderer
    }
  }
}

// What a Delivery email is about: the order and its Vouchers, with their codes revealed.
export type VoucherEmailOrder = {
  id: string
  display_id: number
  email: string
}

export type VoucherEmailVoucher = {
  code: string
  // Only some Partners issue a PIN.
  pin: string | null
  // The Medusa product's title.
  partner: string
  face_value: number
  currency_code: string
  // Whole days (`YYYY-MM-DD`) in the store's timezone; null when that end is open.
  first_day: string | null
  last_day: string | null
  redemption_instructions: string | null
  // Content id of the QR code's inline image attachment: refer to it as `cid:<id>`.
  qr_code_cid: string
}

export type VoucherEmailInput = {
  order: VoucherEmailOrder
  vouchers: VoucherEmailVoucher[]
}

export type RenderedVoucherEmail = {
  subject: string
  html: string
  text: string
}

export type VoucherEmailRenderer = (
  input: VoucherEmailInput
) => RenderedVoucherEmail | Promise<RenderedVoucherEmail>

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
  // True only when this call made the Allocations, not when it returned existing ones.
  created: boolean
}
