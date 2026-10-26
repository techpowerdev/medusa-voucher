# 04: Retry failed Deliveries and recover missing ones

**What to build:** A scheduled job every 15 minutes runs a workflow that sends again the email Deliveries that failed with fewer than 5 attempts or have been sending for more than 10 minutes, and creates and sends the Delivery of every order with first-time Allocations but no email Delivery, among orders allocated between 7 days and 10 minutes before the given time. A page at a time; one order's error is logged and does not stop the others. The Paid order rule applies on every send. Does nothing when `delivery.automatic` is false. See "Automatic retry and recovery" in the delivery spec.

**Blocked by:** 03 (Start delivery after allocation).

**Status:** done (feature/voucher-delivery-retry, pending review)

- [x] A failed Delivery under 5 attempts is sent again; one at 5 stays failed
- [x] A Delivery sending for more than 10 minutes is sent again; a younger one is left alone
- [x] An allocated order with no email Delivery inside the window gets one and is sent; outside the window it is left alone
- [x] An order that is no longer a Paid order is not sent
- [x] One order that throws is logged as an error with its reason and does not stop the others
- [x] With `delivery.automatic: false` the job sends nothing
- [x] The workflow takes the current time and a page size as input; the job only calls it
- [x] Tested at the workflow against a real database

## Comments

- 2026-10-24, built: `retryVoucherDeliveriesWorkflow` (input `now`, `page_size`; returns `retried`, `recovered`, `failed`, `pages`) and the job `retry-voucher-deliveries` (`*/15 * * * *`) that only runs it. The step first marks Deliveries sending since more than 10 minutes before `now` as failed with `Sending was interrupted` (new service method `releaseStaleDeliveries`, one conditional UPDATE), so they are retried like any failed one and one interrupted at its 5th attempt stays failed for an operator. It then retries email Deliveries created within 7 days before `now` that failed fewer than 5 times, and sends orders with first-time Allocations created between 7 days and 10 minutes before `now` that have no email Delivery. Both read a page at a time by id (keyset), so rows that change as they are handled are neither skipped nor read twice. Each order runs `deliverOrderVouchersWorkflow`, which checks the Paid order rule and claims the Delivery. Logs: recovered as a warning, retried as info, a throw as an error with its reason. Nothing runs when `delivery.automatic` is false.
- Decided with the user before building: stuck Deliveries are released to failed rather than claimed directly (Q1), failed Deliveries are retried only within 7 days of their creation (Q2, added to the spec), and the three log levels (Q3).
- Tests: `integration-tests/http/voucher-delivery-retry.spec.ts` (13) and one in `voucher-delivery-manual.spec.ts`. Allocations in the retry spec go through the module so no event starts a Delivery. Red first: a failed Delivery under 5 attempts is sent; a Delivery sending over 10 minutes is sent; one interrupted at its 5th attempt becomes failed; an order without a Delivery is sent and logged; paging; one order throwing. Passed on their first run against an empty stub, each checked against a mutant it fails on: 5 attempts stays failed (limit 6); failed Delivery older than 7 days (no created_at window); sending under 10 minutes (no margin); allocated under 10 minutes and over 7 days (each window end removed); refunded and canceled (Paid order check always true); `delivery.automatic: false` (check removed).
- Full check: lint, typecheck and build pass; unit 26, modules 27, HTTP 103 (+14).
- Screen check (dev app, order #5): Mailpit stopped, bought 1 × 500 THB in the storefront and captured in the admin; the subscriber's Delivery failed (`connect ECONNREFUSED 127.0.0.1:1025`, attempts 1). Mailpit started again (empty inbox), ran the workflow with `medusa exec` (`retried: [order #5]`), and "Your vouchers for order #5" arrived; the Delivery is delivered with 2 attempts. The 15-minute schedule itself was not waited for.
