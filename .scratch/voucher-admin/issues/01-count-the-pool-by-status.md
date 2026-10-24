# 01: Count a Voucher product's Pool by status

**What to build:** `GET /admin/voucher-products/:id` returns the Voucher product with its variant, the Medusa product's title and its counts: Available (status `available`, Validity period not ended, at least the Minimum remaining validity from the later of now and its start, as allocation chooses), Expired (status `available`, Validity period ended), under Minimum remaining validity, Allocated, Delivered and Void. `available_vouchers` in `GET /admin/voucher-products` becomes the Available count; the README says so. See "Counts" in the admin spec.

**Blocked by:** none.

**Status:** done (feature/voucher-admin-pool-counts, pending review)

- [x] Counts treat an expired Voucher and an under-minimum Voucher apart from Available, and a Voucher not yet valid but with enough validity left as Available
- [x] `available_vouchers` in the list equals the Available count
- [x] An unknown id is refused with 404
- [x] No response contains a code, PIN or hash
- [x] Tested through the admin routes against a real database

## Comments

- 2026-10-24, built: the sellable rule allocation used inline became `sellableClause_` in the service, shared by `findEligibleVoucherIds_` and the new `countPoolByVariant(variantIds, now)`, which counts each variant's Pool in one grouped query (available, expired, under_minimum, allocated, delivered, void; a Voucher whose status is `expired`, which nothing sets yet, counts as expired). `GET /admin/voucher-products` uses it for `available_vouchers` and a new `counts`, one query per page instead of one per row; `GET /admin/voucher-products/:id` is new (variant, product title, counts; 404 when unknown). README updated.
- Tests: `integration-tests/http/voucher-pool-counts.spec.ts` (4). Red first: the detail counts (404, no route), the list's `available_vouchers` (5 instead of 3). Passed on their first run, each checked against a mutant it fails on: Available equals what an allocation can take (minimum remaining validity set to 0 in the shared rule fails it, with the two count tests); unknown id refused (returning 200 with null fails it). The existing list test in `voucher-product.spec.ts` passed unchanged (its Vouchers never expire).
- Full check: lint, typecheck and build pass; unit 28, modules 27, HTTP 118 (+4).
- Screen check (dev app): imported one expired Voucher and one with 3 days left into the 500 THB product; the admin API in the browser shows `available: 2, expired: 1, delivered: 8` and `available_vouchers: 2` in the list (the old count would have been 3). `under_minimum` stays 0 there because the dev app sets no `minimumRemainingValidityDays`.
