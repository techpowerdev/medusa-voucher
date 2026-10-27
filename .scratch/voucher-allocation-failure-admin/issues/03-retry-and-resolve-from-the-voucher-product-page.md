# 03: Retry and resolve from the Voucher product page

**What to build:** the section from ticket 02 gets a "retry" action for the Voucher product, which runs the existing retry and states how many orders got their Vouchers, how many still wait and how many could not be tried; and a "resolve" action per waiting row, which asks for a required note in a confirmation that says resolving does not refund the customer. A resolved row cannot be reopened. Uses the existing admin API routes. See `.scratch/voucher-allocation-failure-admin/spec.md` (user stories 6–10, 18; Q4, Q5, Q12).

**Blocked by:** 02

**Status:** ready-for-agent

- [x] Retry calls `POST /admin/voucher-products/:id/retry-allocation-failures` and shows the three counts; the section refreshes
- [x] Resolve requires a note, confirms with the no-refund warning, calls `POST /admin/voucher-allocation-failures/:id/resolve`, and the row moves to settled
- [x] Errors from either route are shown the dashboard's way (rule 14)
- [x] Any wording logic pulled out of the component has a unit test (`src/admin/lib/__tests__`)
- [ ] Checked on the dev host with screenshots: retry after importing a batch serves a waiting order; resolving another with a note (rule 13)
