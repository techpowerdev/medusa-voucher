Status: ready for tickets (not yet implemented). Depends on the Voucher product spec.

# Allocate Vouchers to paid orders

## Problem Statement

A customer buys a Voucher product like any other product and pays. The store must then give that customer exactly one Voucher per purchased unit, never the same Voucher to two customers, never half of an order, and never a Voucher the customer would have too little time to use. When there are not enough Vouchers, a person must find out, because a customer has paid and is owed something. Today Vouchers can be imported but nothing assigns them to orders.

## Solution

When an order's payment has been captured, the system allocates one Available Voucher for each purchased unit of each Voucher product in the order, all or none for the order. Each Allocation links one Voucher to one purchased unit and moves the Voucher to Allocated. If the Pool of a Voucher product cannot cover the units ordered, nothing is allocated for that order and an Allocation failure is recorded for a person to resolve. Running the same allocation again never allocates twice. An operator can retry the open Allocation failures of a Voucher product after importing more Vouchers.

## User Stories

1. As a customer, I want to receive one Voucher for each unit I bought, so that I get what I paid for.
2. As a customer, I want to receive Vouchers only after my payment is captured, so that the store is never out of pocket for a Voucher it gave away.
3. As a customer, I want all the Vouchers of my order or none of them, so that I am never left with half an order I cannot resolve.
4. As a customer, I want a Voucher that still has enough time left to use, so that I am not sold a code that expires tomorrow.
5. As a customer, I want a Voucher that has not started yet to still count if it will be valid long enough once it starts, so that I can buy ahead for a date.
6. As a store owner, I want no two customers ever to get the same Voucher, even when many orders are paid at the same moment, so that no one is turned away at the counter.
7. As a store owner, I want the Vouchers closest to expiring (that still pass the minimum) sold first, so that fewer Vouchers are wasted.
8. As a store owner, I want one minimum remaining validity setting for the whole store, so that I decide how much time customers must have.
9. As a store owner, I want a minimum of zero to mean no minimum, while expired Vouchers are never sold, so that the default is safe.
10. As a store owner, I want a repeated or retried event to allocate nothing extra, so that a duplicate event never gives a customer two Vouchers per unit.
11. As an operator, I want an Allocation failure recorded when the Pool is short, with how many units were ordered and how many were available, so that I know what to fix.
12. As an operator, I want a short Pool to leave the order untouched (no cancellation, no automatic refund), so that I decide whether to restock or refund.
13. As an operator, I want to retry the open Allocation failures of a Voucher product after importing Vouchers, so that waiting customers are served without re-entering anything.
14. As an operator, I want retried failures served oldest first, so that earlier customers are not overtaken.
15. As an operator, I want a failure marked resolved with a note and my identity when it is settled, so that there is an audit trail.
16. As an operator, I want an order with several Voucher products to be allocated per order, all or none across all of its Voucher lines, so that a customer gets a complete order.
17. As a developer, I want an order line for a product that is not a Voucher product ignored by allocation, so that normal products are unaffected.
18. As a store owner, I want the Voucher stock shown to shoppers to use the same rules as allocation, so that a product is not shown in stock when allocation would fail.

## Implementation Decisions

- **Trigger:** the order is fully paid, meaning Medusa's own payment status for the order is `captured` (every payment collection that is not canceled has captured its whole amount; `getLastPaymentStatus` in `@medusajs/core-flows`, used by `getOrderDetailWorkflow`). An authorized, partly captured or refunded order releases nothing. Two subscribers start one workflow that checks this status and then runs the allocation: `payment.captured`, whose payload is only the payment id, mapped to its order through the payment collection and the `order_payment_collection` link (a payment with no order is ignored); and `order.placed`, for providers that capture at authorization, which never emit `payment.captured`. Both may arrive for the same order; allocation is repeatable (ticket 02), so that is safe. The allocation workflow is also the unit the retry operation reuses. See the finding below.
- **Paid order (GLOSSARY.md):** an order is allocated only when it is a Paid order and not canceled. In Medusa terms: the order's status is not `canceled`, and either its payment status is `captured`, or its total is 0 and it has no payment collection (a cart with a total of 0 or less is completed without payment, `validateCartPaymentsStep`; a zero-amount collection already counts as `captured`). The trigger workflow applies this rule. Ticket 06.
- **Recovery of orders that were never allocated:** a scheduled job, every 15 minutes, runs a workflow that finds orders created between 7 days and 10 minutes ago that have a Voucher product line, no Allocation and no Allocation failure of any status, and runs the trigger workflow for each. Being repeatable, allocation is safe even if the subscriber runs at the same time; the 10-minute margin only avoids needless work while subscribers are still running. It covers a subscriber that threw (Medusa's Redis event bus does not retry by default) and an event that never arrived. An order with a failure, open or resolved, is left to the operator (ticket 04). Each recovered order is logged as a warning with its id and outcome; an order whose recovery throws is logged as an error and the job continues with the next, trying it again on the next run until it leaves the window. Orders are read 500 at a time so memory and query parameters stay bounded. The window and schedule are constants for now; making them options later needs no data change. Known costs: an order that is not yet a Paid order (authorized but not captured, or whose Voucher lines were removed by an edit) is checked again on every run until it leaves the window, up to about 670 times; an order allocated by its subscriber while a run is going is checked again just before it is tried, so it is rarely, but not never, reported as recovered. Ticket 05.
- **All or none per order:** the workflow collects every unit that needs a Voucher across the order's Voucher lines, finds Vouchers for all of them in one transaction, and either assigns all or records one Allocation failure per short Voucher product and assigns nothing.
- **Voucher product:** a variant is a Voucher product exactly when it is linked to one (see the Voucher product spec and ADR-0003). Order lines for other variants are ignored. A linked variant with an empty Pool is an Allocation failure, never silence.
- **Eligibility of a Voucher:** status Available, not Expired, and at least the minimum remaining validity left. Remaining validity is measured from the later of the allocation moment and the Voucher's valid-from instant to its valid-until instant. A Voucher with no valid-until is always eligible. A Voucher whose valid-until has passed is never eligible, whatever the minimum.
- **Minimum remaining validity:** a plugin option, a number of days, one value for the whole store, default 0 (no minimum). It is computed at allocation time from the Voucher's own dates, so moving it to a per-product setting later needs no data migration.
- **Choosing Vouchers:** among eligible Vouchers of the variant, the earliest valid-until first, with Vouchers that never expire last, then by creation order. This is the first-expiring-first-out rule.
- **Concurrency:** Vouchers are chosen and marked Allocated inside one database transaction using row locks that skip rows other transactions have locked, so concurrent orders get different Vouchers and never wait on each other. The lock must be taken inside a transaction, and the lock wait is bounded, as Medusa's own payment module does when capturing payments (it fails explicitly if it is not in a transaction rather than silently losing the lock). The existing one-Allocation-per-Voucher uniqueness stays as the second line of defence.
- **Idempotency:** each Allocation records which unit of the order line it is (a unit number within the line item). Uniqueness over line item and unit number means a repeated run finds the units already served and allocates only what is missing. Because allocation is all or none, a repeat either finds the order complete or allocates the whole order. This needs one new column and a unique constraint on the Allocation model, and a new migration.
- **Allocation failure:** one record per short Voucher product per order, status open, with units requested and units available at that moment. The order is not cancelled and money is not returned automatically. A record is resolved by an operator with a note and their identity, or automatically when its order is allocated by any route (a retry, a subscriber or the recovery job): the allocation marks the order's open failures resolved by `system` in the same transaction. An operator resolves one failure at a time; resolving one does not close the order's others.
- **Retry:** a workflow takes a Voucher product, finds its open Allocation failures oldest first, and tries each distinct order once through the trigger workflow, so the Paid order rule applies (an order refunded or canceled while it waited is not allocated and its failures stay open). Allocation is all or none per order, so an order also short on another Voucher product stays failed. It is exposed as admin operations: list failures (`GET /admin/allocation-failures`, open by default, filterable by Voucher product), retry a Voucher product's failures (`POST /admin/voucher-products/:id/retry-allocation-failures`, returning the orders allocated, still open and failed; an order that throws is logged and the others are still tried) and resolve one failure with a required note (`POST /admin/allocation-failures/:id/resolve`; 404 when unknown, 422 when already resolved). Nothing runs it automatically after an import in this spec.
- **Customer details on the Allocation:** the Allocation copies the order's customer and recipient email so Delivery does not need to look them up. Delivery itself is out of scope.
- **Status:** allocating moves a Voucher from Available to Allocated. Moving on to Delivered is Delivery's job.
- **Vocabulary:** terms are those of GLOSSARY.md (Paid order, Allocation, Allocated, Allocation failure, Pool, Minimum remaining validity). Paid order was added on 2026-10-22, and Allocation failure now refers to it.
- **Secrets:** allocation never decrypts codes, and no response or log of this feature contains a code or PIN.

## Testing Decisions

- A good test sets up a Pool and an order, runs the behaviour, and asserts outcomes: which Vouchers were allocated, what statuses and records exist, and that nothing was allocated when it should not be. It does not assert on the internals of how Vouchers were selected beyond the observable order.
- **Proposed seam (to confirm with the owner):** the allocation workflow, run against a real database with real Vouchers, batches and an order. One seam, as high as it can go without needing a payment provider. The subscribers are covered by thin end-to-end tests that the capture event and the placed event start allocation; the payment rule (fully captured or not) is tested at the workflow that checks it.
- Cases: exact stock, short stock (nothing allocated, failure recorded with both counts), several lines in one order where only one product is short (none allocated), first-expiring-first-out order, never-expiring Vouchers last, a minimum that excludes some Vouchers, a not-yet-started Voucher counted from its start, an expired Voucher never chosen, a repeated run allocating nothing more, two orders paid concurrently for the last Voucher (exactly one succeeds), retry serving the oldest failure first, and the zero default.
- The concurrency test runs the workflow twice in parallel and asserts the Voucher is allocated once and the other order gets a failure record.
- Prior art: the module tests with a real database and the race test in `service.spec.ts`; the HTTP integration test setup in `integration-tests/http/plugin.spec.ts`.

## Out of Scope

- Delivery by email or LINE, and QR codes (next spec). Allocated Vouchers stay Allocated until then.
- Replacement of a Voucher that did not work.
- Admin pages for Allocations and Allocation failures; alerts about failures, Low stock and Expiring soon.
- Automatic retry after an import, automatic refunds, automatic order cancellation.
- Reserving Vouchers in the cart or at checkout.
- A minimum remaining validity per product or per batch.
- Changing what shoppers see as stock (story 18 states the requirement; the integration with Medusa's inventory is its own spec).
- Allocating for orders paid before this feature existed.

## Further Notes

- **Finding, how Medusa reports capture (checked against Medusa 2.21.2 source, 2026-10-22):**
  - `payment.captured` is emitted by `capturePaymentWorkflow` with `{ id }`, the payment id, on every capture including a partial one (`core-flows/dist/payment/workflows/capture-payment.js`). The workflow itself maps the payment to its order through `order_payment_collection` by `payment_collection_id`.
  - A provider that returns `captured` when authorizing (Stripe with `capture: true`, `payment-stripe/dist/core/stripe-base.js`) is captured inside the payment module's `authorizePaymentSession_`, which calls `capturePayment` directly and emits no event. Listening to `payment.captured` alone would never allocate for such stores.
  - `order.placed` is emitted inside `completeCartWorkflow` before the payment session is authorized, but workflow events are grouped and released only when the workflow finishes (and dropped when it fails), so subscribers see the authorized or captured payment (`workflows-sdk/dist/helper/workflow-export.js`, `attachOnFinishReleaseEvents`).
  - Whether the order is fully paid is Medusa's computed payment status: `captured` only when each non-canceled payment collection has `captured_amount` within the currency's precision of `amount`; otherwise `partially_captured`, `authorized`, a refund status and so on.
- **Units available in an Allocation failure:** counted from the Vouchers that could be locked at that moment. Vouchers that a concurrent allocation holds are skipped, so while several orders compete the number can be lower than the Pool a moment later. It is a snapshot for the operator, not a stock figure.
- **Decided, a subscriber that fails:** Medusa's Redis event bus does not retry a failed subscriber by default (`attempts: 1`), so a Paid order could be left with neither Allocations nor an Allocation failure. The recovery job covers it (ticket 05). Limitation: an order captured more than 7 days after it was created, whose subscriber also failed, is outside the window and is not recovered.
- **Decided, orders with a total of 0:** checked against the Medusa 2.21.2 source, not run: the cart's payment collection is linked to the order only if the cart had one (`complete-cart.js`); a collection with amount 0 counts as `captured` (`getLastPaymentStatus`), but an order with no collection is `not_paid`. Such orders are Paid orders (ticket 06). A zero-amount collection keeps the database status `not_paid` and no `completed_at`, so recovery finds orders by creation date, not by collection.
- **Open question, Voucher lines added after allocation:** an order that already has Allocations counts as complete (ticket 02), so a Voucher product line added later by an order edit or an exchange is not allocated. Not handled by this spec.
- **Open question, stock shown to shoppers:** Medusa's inventory does not know about the minimum remaining validity. Either maintain an inventory level from the Pool of eligible Vouchers, or compute availability through the plugin. Needs its own spec.
- Valid-until is stored as the first instant a Voucher no longer applies (see the CSV import spec), so remaining validity is a plain difference of instants.
