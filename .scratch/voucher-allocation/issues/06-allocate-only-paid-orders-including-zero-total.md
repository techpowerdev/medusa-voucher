# 06: Allocate only Paid orders, including those with a total of 0

**What to build:** The trigger workflow allocates exactly the Paid orders (GLOSSARY.md) that are not canceled. Besides a payment status of `captured`, an order with a total of 0 and no payment collection is a Paid order: a cart with a total of 0 or less is completed without payment, and today such an order is `not_paid` and never allocated. A canceled order is never allocated, whatever its payment status. See "Paid order" in the allocation spec.

**Blocked by:** 03 (Start allocation when the payment is fully captured).

**Status:** done (feature/paid-order-rule, pending review)

- [x] An order with a total of 0 and no payment collection is allocated
- [x] A canceled order is not allocated, whether its total is 0 or its payment is captured
- [x] The existing rules still hold: authorized only and partly captured allocate nothing
- [x] Tested at `allocateVouchersForPaidOrderWorkflow` against a real database

## Comments

- 2026-10-22: added a guard case not in the list: an order that costs something and has no payment collection yet is not allocated. It passed on its first run; the rule was then made to treat a missing total as not paid instead of 0.
- 2026-10-22, not tested: a real `completeCartWorkflow` for a cart with a total of 0 (the test creates the order through the Order module, with no payment collection). The rule follows the reading of `validateCartPaymentsStep` and `complete-cart.js` in the spec.
