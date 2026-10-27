# 05: Waiting for Vouchers notice on the order page

**What to build:** a widget on Medusa's order details page, shown only when the order has an open Allocation failure, that names each Voucher product the order is short of with the units and links to its page; no actions. The Allocation failure list API gains an `order_id` filter for it. See `.scratch/voucher-allocation-failure-admin/spec.md` (user stories 12–13; Q2, Q14).

**Blocked by:** None (can start immediately). Touches the same list route as 02 (a different part); rebase on whichever merges first.

**Status:** ready-for-agent

- [x] `GET /admin/voucher-allocation-failures?order_id=…` returns only that order's failures (HTTP test in `allocation-failures-admin.spec.ts`)
- [x] The widget shows nothing for an order without an open failure, and a notice with each Voucher product, the units and a link otherwise, in English and Thai
- [x] README mentions the widget and the filter
- [ ] Checked on the dev host with screenshots: an order waiting for Vouchers and one that is not (rule 13)
