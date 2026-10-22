# 01: Record Deliveries per order and channel

**What to build:** A Delivery record of the Voucher module: one order sent on one channel, with recipient, status (pending, sending, delivered, failed), attempts, last error and delivery time, unique per order and channel. The delivery columns on the Allocation are removed. See ADR-0004 and "Delivery is its own record" in the delivery spec. No sending yet.

**Blocked by:** none (allocation spec done).

**Status:** ready-for-agent

- [ ] The Delivery model and its status enum exist, with uniqueness over order and channel, in a generated, committed migration with no drift
- [ ] The Allocation no longer has delivery channel, status, attempts, error or delivered-at columns, removed by the same migration; existing allocation tests still pass
- [ ] Claiming a Delivery for sending is one conditional update that matches only a pending or failed Delivery, increments its attempts and returns whether this caller claimed it; two concurrent claims succeed once
- [ ] The HTTP tests build the database from the migrations alone and pass
