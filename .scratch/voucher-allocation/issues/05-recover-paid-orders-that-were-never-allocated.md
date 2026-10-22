# 05: Recover paid orders that were never allocated

**What to build:** A fully paid order with Voucher product lines must end with either its Allocations or an open Allocation failure, even when the subscriber that should have allocated it failed. Today a failure in the `payment.captured` or `order.placed` subscriber (a lock timeout, a database error) leaves the order with neither: Medusa's Redis event bus emits with `attempts: 1` by default (`event-bus-redis/dist/services/event-bus-redis.js`) and only logs "Retrying is not configured", and ticket 04 retries only failures that were recorded. Needs a design decision before building, for example a scheduled job that finds fully paid orders with Voucher lines and neither Allocations nor an open failure and runs the allocation for them, or recording a failure when the allocation throws.

**Blocked by:** 03 (Start allocation when the payment is fully captured).

**Status:** needs-triage

- [ ] The design is agreed and written into the allocation spec
- [ ] A fully paid order whose allocation never ran or threw ends with its Allocations or an open Allocation failure, without a person noticing it first
- [ ] Find out whether an order with a total of 0 (a 100% promotion skips payment in `validateCartPaymentsStep`) has a payment collection and reaches Medusa's `captured` status; if not, decide how such orders are allocated
