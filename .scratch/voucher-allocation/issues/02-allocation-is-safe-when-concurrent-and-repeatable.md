# 02: Allocation is safe when concurrent and repeatable

**What to build:** Allocation never gives the same Voucher to two orders, however many are paid at the same moment, and running it again for an order never allocates more than the order needs. Vouchers are chosen and marked inside one database transaction using row locks that skip rows other transactions hold, with a bounded lock wait, and the lock must be taken inside a transaction or the operation fails loudly, as Medusa's own payment module does. The one-Allocation-per-Voucher uniqueness stays as the second defence, and uniqueness over line item and unit number makes a repeat a no-op.

**Blocked by:** 01 (Allocate Vouchers to an order, all or none).

**Status:** done (feature/voucher-allocation-concurrency, pending review)

- [x] Two orders allocated in parallel for the last Voucher: exactly one succeeds and the other gets an Allocation failure; no Voucher is assigned twice
- [x] Many orders allocated in parallel against a Pool large enough for some: the number of Vouchers allocated equals the Pool consumed, with no duplicates and no lost Vouchers
- [x] Running the allocation again for an order that is already fully allocated changes nothing (same Allocations, same Vouchers)
- [x] Running it again after a failure, once the Pool has enough, allocates the whole order once
- [x] Concurrent runs for the same order allocate it once
- [x] The lock wait is bounded; running outside a transaction fails with a clear error instead of silently losing the lock (in code only: the public method always opens a transaction, so the guard cannot be reached from a test)
- [x] The parallel cases run as automated tests against a real database
- [x] Running it again while the Pool is still short keeps one open Allocation failure per short line instead of adding another
- [x] Concurrent runs for the same order while the Pool is short record one open Allocation failure per short line; a unique index over the line item among open failures is the second defence, in a generated migration

## Comments

- 2026-10-22: the two failure items were added during the work, with the owner's approval. Without them, every repeated run while the Pool is short (a redelivered capture event in ticket 03, for example) adds another open failure for the same line, and ticket 04's oldest-first retry would meet duplicates.
- 2026-10-22, not tested: the bounded lock wait (`SET LOCAL lock_timeout = '3s'`). `SKIP LOCKED` never waits on a Voucher row, so the timeout only bounds other waits; no test exercises it.
