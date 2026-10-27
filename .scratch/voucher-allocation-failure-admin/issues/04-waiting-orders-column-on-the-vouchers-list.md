# 04: Waiting orders column on the Vouchers list

**What to build:** the Voucher product list and one-Voucher-product admin APIs return the number of orders with an open Allocation failure for that Voucher product (orders, not units, worked out when read), and the Vouchers list page shows it in a column "Allocation failures" ("รอ Voucher"). See `.scratch/voucher-allocation-failure-admin/spec.md` (user story 11; Q3, Q11, Q13).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] `GET /admin/voucher-products` and `GET /admin/voucher-products/:id` return the number of waiting orders; an order short on two lines of the same Voucher product counts once; resolved failures do not count (HTTP tests in `voucher-pool-counts.spec.ts`)
- [x] The list page shows the column in English and Thai
- [x] README documents the new field
- [ ] Checked on the dev host with a screenshot (rule 13)
