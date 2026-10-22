# 03: Start delivery after allocation

**What to build:** When an allocation creates new Allocations, the plugin emits `voucher.allocated` with the order id after the allocation commits, and a subscriber runs the delivery workflow. A repeated allocation that returns existing Allocations emits nothing. The plugin option `delivery.automatic` (default true) turns this off: with false, nothing is sent and no Delivery is created. See "Trigger" and "Turning it off" in the delivery spec.

**Blocked by:** 02 (Send an order's Vouchers in one email).

**Status:** ready-for-agent

- [ ] An allocation that creates Allocations emits `voucher.allocated` once with the order id; a repeated run emits nothing
- [ ] A thin end-to-end test shows an allocation leading to one delivered email through the event
- [ ] With `delivery.automatic: false` an allocation sends nothing and creates no Delivery
- [ ] A failing delivery never rolls back or blocks the allocation
