# 01: Allocate Vouchers to an order, all or none

**What to build:** Given an order, a workflow allocates one Available Voucher for each purchased unit of each line whose variant is a Voucher product, moves those Vouchers to Allocated, and records each assignment with the order, line item, unit number, customer and recipient email. It is all or none for the whole order. If a Voucher product's Pool cannot cover the units ordered, nothing is allocated for the order and one Allocation failure is recorded per short Voucher product with the units requested and available. Lines for variants that are not Voucher products are ignored. Which Vouchers are eligible and in which order follows the allocation spec: Available, not expired, at least the minimum remaining validity left, earliest valid-until first, never-expiring last.

**Blocked by:** voucher-product 02 (Import vouchers against a Voucher product).

**Status:** ready-for-agent

- [ ] Running the workflow for an order with enough Vouchers allocates exactly one Voucher per unit and marks them Allocated; each assignment records order, line item, unit number, customer and recipient email
- [ ] A short Pool allocates nothing for the order, leaves its Vouchers Available, and records an open Allocation failure with units requested and available; the order itself is untouched
- [ ] An order with several Voucher products where only one is short allocates none of them
- [ ] Lines for variants that are not Voucher products are ignored; a Voucher product with an empty Pool is a visible Allocation failure
- [ ] Vouchers whose valid-until has passed are never chosen; the earliest valid-until goes first and never-expiring Vouchers last
- [ ] The plugin option for the minimum remaining validity (days, default 0) excludes Vouchers with too little time left, counting from the later of now and the valid-from instant; a not-yet-started Voucher is counted from its start
- [ ] The new unit-number column and its uniqueness are in a generated, committed migration with no drift
- [ ] No Voucher code or PIN is decrypted, returned or logged by this feature
- [ ] Tested through the workflow against a real database with real Vouchers and an order (the seam named in the allocation spec)
