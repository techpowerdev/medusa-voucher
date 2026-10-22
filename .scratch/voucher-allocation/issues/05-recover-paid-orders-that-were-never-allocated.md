# 05: Recover Paid orders that were never allocated

**What to build:** A Paid order with Voucher product lines ends with its Allocations or an Allocation failure, even when the subscriber that should have allocated it threw or its event never arrived. Medusa's Redis event bus emits with `attempts: 1` by default (`event-bus-redis/dist/services/event-bus-redis.js`) and only logs "Retrying is not configured", and ticket 04 retries only failures that were recorded. A scheduled job in the plugin, every 15 minutes, runs a recovery workflow over orders created between 7 days and 10 minutes ago that have a Voucher product line and neither an Allocation nor an Allocation failure of any status, and runs the trigger workflow for each. See "Recovery of orders that were never allocated" in the allocation spec.

**Blocked by:** 06 (Allocate only Paid orders, including those with a total of 0).

**Status:** ready-for-agent

- [ ] A Paid order with Voucher lines and no Allocation or failure, created inside the window, is allocated by the recovery workflow
- [ ] Left alone: an order younger than 10 minutes, one older than 7 days, one with a failure (open or resolved), one already allocated, one that is not a Paid order, one without Voucher lines
- [ ] Each recovered order is logged as a warning with its id and outcome, never a code
- [ ] An order whose recovery throws is logged as an error and does not stop the others
- [ ] The recovery workflow takes the current time as input so the window can be tested; the job in `src/jobs/` only calls it
- [ ] Tested at the recovery workflow against a real database; the job's schedule is Medusa's and is not tested

## Comments

- 2026-10-22: designed with the owner (grilling, Q1–Q13). Rejected: recording a failure when the subscriber throws (it misses events that never arrive and fails with the database), and a plugin table of orders waiting for allocation (no row when the event never arrives). Known limitation: an order captured more than 7 days after it was created whose subscriber also failed is not recovered.
