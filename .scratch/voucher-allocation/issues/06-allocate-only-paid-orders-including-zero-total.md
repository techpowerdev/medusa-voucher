# 06: Allocate only Paid orders, including those with a total of 0

**What to build:** The trigger workflow allocates exactly the Paid orders (GLOSSARY.md) that are not canceled. Besides a payment status of `captured`, an order with a total of 0 and no payment collection is a Paid order: a cart with a total of 0 or less is completed without payment, and today such an order is `not_paid` and never allocated. A canceled order is never allocated, whatever its payment status. See "Paid order" in the allocation spec.

**Blocked by:** 03 (Start allocation when the payment is fully captured).

**Status:** ready-for-agent

- [ ] An order with a total of 0 and no payment collection is allocated
- [ ] A canceled order is not allocated, whether its total is 0 or its payment is captured
- [ ] The existing rules still hold: authorized only and partly captured allocate nothing
- [ ] Tested at `allocateVouchersForPaidOrderWorkflow` against a real database
