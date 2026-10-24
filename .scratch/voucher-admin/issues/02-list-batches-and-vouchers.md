# 02: List a Voucher product's batches and Vouchers

**What to build:** `GET /admin/voucher-products/:id/batches` (newest purchase first, each with purchase date, unit cost, reference, Redemption instructions and counts by status, paginated) and `GET /admin/voucher-products/:id/vouchers` (each Voucher's id, status, batch id and reference, first and last usable day in the plugin's `timezone` or null when open, and the order's id and display number when allocated or delivered; filter by status, Expired and under minimum included, and by batch; ordered by valid-until soonest first and open-ended last; 20 per page by default). See the admin spec.

**Blocked by:** 01 (Count a Voucher product's Pool by status).

**Status:** ready-for-agent

- [ ] Batches come newest first with their counts, a page at a time
- [ ] Vouchers come soonest to expire first, open-ended last, with usable days in the store's time zone
- [ ] An allocated or delivered Voucher shows its order's display number
- [ ] Filtering by status (including Expired and under minimum) and by batch
- [ ] An unknown Voucher product is refused with 404
- [ ] No response contains a code, PIN or hash
- [ ] Tested through the admin routes against a real database
