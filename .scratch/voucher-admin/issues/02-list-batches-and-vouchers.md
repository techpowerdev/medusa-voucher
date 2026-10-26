# 02: List a Voucher product's batches and Vouchers

**What to build:** `GET /admin/voucher-products/:id/batches` (newest purchase first, each with purchase date, unit cost, reference, Redemption instructions and counts by status, paginated) and `GET /admin/voucher-products/:id/vouchers` (each Voucher's id, status, batch id and reference, first and last usable day in the plugin's `timezone` or null when open, and the order's id and display number when allocated or delivered; filter by status, Expired and under minimum included, and by batch; ordered by valid-until soonest first and open-ended last; 20 per page by default). See the admin spec.

**Blocked by:** 01 (Count a Voucher product's Pool by status).

**Status:** done (PR #25)

- [x] Batches come newest first with their counts, a page at a time
- [x] Vouchers come soonest to expire first, open-ended last, with usable days in the store's time zone
- [x] An allocated or delivered Voucher shows its order's display number
- [x] Filtering by status (including Expired and under minimum) and by batch
- [x] An unknown Voucher product is refused with 404
- [x] No response contains a code, PIN or hash (the masked `code_hint` only)
- [x] Tested through the admin routes against a real database

## Comments

- 2026-10-24, decided with the owner before building: show the masked `code_hint` (Q1); `status` in the list is the counted one (Q2). Asked whether to store Expired in the database instead: yes for Expired, which never comes back, through a job (new ticket 06, before 03); never for under the minimum, which depends on an option the store can change. The spec says so.
- Built: the service's `poolStatusSql_` (a CASE over the shared sellable rule) gives each Voucher its place in the Pool; `countPoolByVariant` became `countPool("variant" | "batch", ids)`, grouping by that status; `listPoolVouchers` reads a page with its batch and first-time Allocation in one query plus a count, ordered by valid-until (open-ended last), then creation and id, with first and last usable days in the store's timezone (`lastDayOf`, now shared with the delivery email). Routes `GET /admin/voucher-products/:id/batches` and `/vouchers` (zod-validated `limit`, `offset`, `status`, `batch_id`; 404 for an unknown product); the vouchers route reads the orders' display ids in one query. README updated.
- Tests: `integration-tests/http/voucher-pool-lists.spec.ts` (7), all red first (no routes). Ticket 01's count tests still pass after the counting moved to the shared status.
- Full check: lint, typecheck and build pass; unit 28, modules 27, HTTP 125 (+7).
- Screen check (dev app): the admin API in the browser lists the 500 THB product's batches newest first with their counts, and its Vouchers with `expired` first, then the one ending on 27 October, then a delivered one showing order #2 and its hint. The dev backend had to be stopped and started again: its automatic restart after `plugin:add` kept serving the old routes.
