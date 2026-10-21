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

- **Trigger:** the order's payment has been captured (Medusa emits `payment.captured`; `order.placed` is not enough because capture can happen after the order is placed, and an authorized but uncaptured payment must not release a code). A subscriber starts the allocation workflow with the order. The allocation workflow is also the unit the retry operation reuses. To verify when building: which order and payment ids the `payment.captured` event carries, and how a captured payment maps to its order.
- **All or none per order:** the workflow collects every unit that needs a Voucher across the order's Voucher lines, finds Vouchers for all of them in one transaction, and either assigns all or records one Allocation failure per short Voucher product and assigns nothing.
- **Voucher product:** a variant is a Voucher product exactly when it is linked to one (see the Voucher product spec and ADR-0003). Order lines for other variants are ignored. A linked variant with an empty Pool is an Allocation failure, never silence.
- **Eligibility of a Voucher:** status Available, not Expired, and at least the minimum remaining validity left. Remaining validity is measured from the later of the allocation moment and the Voucher's valid-from instant to its valid-until instant. A Voucher with no valid-until is always eligible. A Voucher whose valid-until has passed is never eligible, whatever the minimum.
- **Minimum remaining validity:** a plugin option, a number of days, one value for the whole store, default 0 (no minimum). It is computed at allocation time from the Voucher's own dates, so moving it to a per-product setting later needs no data migration.
- **Choosing Vouchers:** among eligible Vouchers of the variant, the earliest valid-until first, with Vouchers that never expire last, then by creation order. This is the first-expiring-first-out rule.
- **Concurrency:** Vouchers are chosen and marked Allocated inside one database transaction using row locks that skip rows other transactions have locked, so concurrent orders get different Vouchers and never wait on each other. The lock must be taken inside a transaction, and the lock wait is bounded, as Medusa's own payment module does when capturing payments (it fails explicitly if it is not in a transaction rather than silently losing the lock). The existing one-Allocation-per-Voucher uniqueness stays as the second line of defence.
- **Idempotency:** each Allocation records which unit of the order line it is (a unit number within the line item). Uniqueness over line item and unit number means a repeated run finds the units already served and allocates only what is missing. Because allocation is all or none, a repeat either finds the order complete or allocates the whole order. This needs one new column and a unique constraint on the Allocation model, and a new migration.
- **Allocation failure:** one record per short Voucher product per order, status open, with units requested and units available at that moment. The order is not cancelled and money is not returned automatically. A record is resolved by an operator with a note, or by a successful retry.
- **Retry:** a workflow takes a Voucher product, finds its open Allocation failures oldest first, and tries each as a normal all-or-none allocation for its order, resolving the failure when it succeeds. It is exposed as an admin operation. Nothing runs it automatically after an import in this spec.
- **Customer details on the Allocation:** the Allocation copies the order's customer and recipient email so Delivery does not need to look them up. Delivery itself is out of scope.
- **Status:** allocating moves a Voucher from Available to Allocated. Moving on to Delivered is Delivery's job.
- **Vocabulary:** terms are those of GLOSSARY.md (Allocation, Allocated, Allocation failure, Pool, Minimum remaining validity). No glossary change is needed.
- **Secrets:** allocation never decrypts codes, and no response or log of this feature contains a code or PIN.

## Testing Decisions

- A good test sets up a Pool and an order, runs the behaviour, and asserts outcomes: which Vouchers were allocated, what statuses and records exist, and that nothing was allocated when it should not be. It does not assert on the internals of how Vouchers were selected beyond the observable order.
- **Proposed seam (to confirm with the owner):** the allocation workflow, run against a real database with real Vouchers, batches and an order. One seam, as high as it can go without needing a payment provider. The subscriber is covered by one thin end-to-end test that the capture event starts the workflow.
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

- **Open question, partial and manual capture:** capturing part of an order's payment must not release codes; the trigger should wait until the order is fully paid. Verify how Medusa reports full capture before building.
- **Open question, stock shown to shoppers:** Medusa's inventory does not know about the minimum remaining validity. Either maintain an inventory level from the Pool of eligible Vouchers, or compute availability through the plugin. Needs its own spec.
- Valid-until is stored as the first instant a Voucher no longer applies (see the CSV import spec), so remaining validity is a plain difference of instants.
