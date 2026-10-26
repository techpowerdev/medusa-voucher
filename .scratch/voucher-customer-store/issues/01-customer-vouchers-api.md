# 01: Store API for a customer's own Vouchers

**What to build:** `GET /store/customers/me/vouchers` (masked list) and `GET /store/customers/me/vouchers/:id` (full code, PIN and QR code), with the rule 17 exception and the guard test update, and README. See `.scratch/voucher-customer-store/spec.md`.

**Blocked by:** none.

**Status:** ready-for-agent

- [x] The list shows only the signed-in customer's Allocated and Delivered Vouchers, masked, newest order first, filterable by order and paginated (HTTP tests)
- [x] One Voucher returns code, PIN and a QR code of the code alone; another customer's, a Void or an unknown one is 404 (HTTP tests)
- [x] Without a signed-in customer both routes refuse (401)
- [x] No response of the list contains a full code, PIN, hash or encrypted column
- [x] Rule 17 and `host-names.unit.spec.ts` allow `/store/customers/me/voucher...` only
- [x] README documents both routes
- [x] Checked on the dev host with screenshots (rule 13)
