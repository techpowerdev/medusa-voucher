# 02: Allocation is safe when concurrent and repeatable

**What to build:** Allocation never gives the same Voucher to two orders, however many are paid at the same moment, and running it again for an order never allocates more than the order needs. Vouchers are chosen and marked inside one database transaction using row locks that skip rows other transactions hold, with a bounded lock wait, and the lock must be taken inside a transaction or the operation fails loudly, as Medusa's own payment module does. The one-Allocation-per-Voucher uniqueness stays as the second defence, and uniqueness over line item and unit number makes a repeat a no-op.

**Blocked by:** 01 (Allocate Vouchers to an order, all or none).

**Status:** ready-for-agent

- [ ] Two orders allocated in parallel for the last Voucher: exactly one succeeds and the other gets an Allocation failure; no Voucher is assigned twice
- [ ] Many orders allocated in parallel against a Pool large enough for some: the number of Vouchers allocated equals the Pool consumed, with no duplicates and no lost Vouchers
- [ ] Running the allocation again for an order that is already fully allocated changes nothing (same Allocations, same Vouchers)
- [ ] Running it again after a failure, once the Pool has enough, allocates the whole order once
- [ ] Concurrent runs for the same order allocate it once
- [ ] The lock wait is bounded; running outside a transaction fails with a clear error instead of silently losing the lock
- [ ] The parallel cases run as automated tests against a real database
