# 01: Record Deliveries per order and channel

**What to build:** A Delivery record of the Voucher module: one order sent on one channel, with recipient, status (pending, sending, delivered, failed), attempts, last error and delivery time, unique per order and channel. The delivery columns on the Allocation are removed. See ADR-0004 and "Delivery is its own record" in the delivery spec. No sending yet.

**Blocked by:** none (allocation spec done).

**Status:** done (feature/voucher-delivery-record, pending review)

- [x] The Delivery model and its status enum exist, with uniqueness over order and channel, in a generated, committed migration with no drift
- [x] The Allocation no longer has delivery channel, status, attempts, error or delivered-at columns, removed by the same migration; existing allocation tests still pass
- [x] Claiming a Delivery for sending is one conditional update that matches only a pending or failed Delivery, increments its attempts and returns whether this caller claimed it; two concurrent claims succeed once
- [x] The HTTP tests build the database from the migrations alone and pass

## Comments

- 2026-10-23, built: `claimDelivery` creates the Delivery with `INSERT ... ON CONFLICT DO NOTHING` and claims it with one conditional UPDATE through the transaction's knex, the same way Allocation failures are resolved. Only the first claim test went red (the enum and method were missing); the other four passed on their first run because the claim was written whole. Removing the status condition made two of them fail, so they do check it. The allocation test that asserted the old delivery columns now asserts the Allocation's own fields, since those columns no longer exist (ADR-0004).
- 2026-10-23, not explained: one full HTTP run failed one test, before a lint-only change; the failing test's name was not captured, and the next nine runs all passed. Tried to reproduce it with 32 more runs (21 plain, 6 with every CPU core busy, 5 chained after the module tests as in the failing run): all passed. Ruled out: the two runners sharing a database (their names differ). Inconclusive: the 3-second lock timeout in the same-order concurrency tests (delaying the winner by 4 seconds did not make the loser time out, apparently because the Allocation rows are written at commit). The failing test's name was lost because the output had been filtered to the summary line; full logs are kept from now on.
