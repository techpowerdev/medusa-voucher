import {
  RenderedVoucherEmail,
  VoucherEmailInput,
  VoucherEmailVoucher,
} from "../../modules/voucher/types"

export type { RenderedVoucherEmail, VoucherEmailInput, VoucherEmailVoucher }

// HTML-escapes a value placed in the email body.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function faceValue(voucher: VoucherEmailVoucher): string {
  return `${voucher.face_value} ${voucher.currency_code.toUpperCase()}`
}

function validity(voucher: VoucherEmailVoucher): string | null {
  if (voucher.first_day && voucher.last_day) {
    return `Valid from ${voucher.first_day} to ${voucher.last_day}`
  }
  if (voucher.last_day) {
    return `Valid until ${voucher.last_day}`
  }
  if (voucher.first_day) {
    return `Valid from ${voucher.first_day}`
  }

  return null
}

function voucherText(voucher: VoucherEmailVoucher): string {
  return [
    `${voucher.partner}, ${faceValue(voucher)}`,
    `Code: ${voucher.code}`,
    voucher.pin ? `PIN: ${voucher.pin}` : null,
    validity(voucher),
    voucher.redemption_instructions,
  ]
    .filter((line): line is string => !!line)
    .join("\n")
}

function voucherHtml(voucher: VoucherEmailVoucher): string {
  const validFor = validity(voucher)

  return [
    `<h2>${escapeHtml(voucher.partner)}, ${escapeHtml(faceValue(voucher))}</h2>`,
    `<p>Code: <strong>${escapeHtml(voucher.code)}</strong></p>`,
    `<p><img src="cid:${escapeHtml(voucher.qr_code_cid)}" alt="QR code" width="200" height="200"></p>`,
    voucher.pin ? `<p>PIN: <strong>${escapeHtml(voucher.pin)}</strong></p>` : null,
    validFor ? `<p>${escapeHtml(validFor)}</p>` : null,
    voucher.redemption_instructions ? `<p>${escapeHtml(voucher.redemption_instructions)}</p>` : null,
  ]
    .filter((line): line is string => !!line)
    .join("\n")
}

/** The plugin's default Delivery email, in English. */
export function renderVoucherEmail({ order, vouchers }: VoucherEmailInput): RenderedVoucherEmail {
  const heading = `Your vouchers for order #${order.display_id}`

  return {
    subject: heading,
    text: [heading, ...vouchers.map(voucherText)].join("\n\n"),
    html: [`<h1>${escapeHtml(heading)}</h1>`, ...vouchers.map(voucherHtml)].join("\n"),
  }
}
