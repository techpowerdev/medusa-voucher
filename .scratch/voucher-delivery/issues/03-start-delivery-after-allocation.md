# 03: Start delivery after allocation

**What to build:** When an allocation creates new Allocations, the plugin emits `voucher.allocated` with the order id after the allocation commits, and a subscriber runs the delivery workflow. A repeated allocation that returns existing Allocations emits nothing. The plugin option `delivery.automatic` (default true) turns this off: with false, nothing is sent and no Delivery is created. See "Trigger" and "Turning it off" in the delivery spec.

**Blocked by:** 02 (Send an order's Vouchers in one email).

**Status:** done (feature/voucher-delivery-automatic, pending review)

- [x] An allocation that creates Allocations emits `voucher.allocated` once with the order id; a repeated run emits nothing
- [x] A thin end-to-end test shows an allocation leading to one delivered email through the event
- [x] With `delivery.automatic: false` an allocation sends nothing and creates no Delivery
- [x] A failing delivery never rolls back or blocks the allocation

## Comments

- 2026-10-24, built: `allocateVouchersToOrderWorkflow` emits `voucher.allocated` (`VoucherEvents.ALLOCATED`) with `{ order_id }` through Medusa's `emitEventStep` when the run made the Allocations. The service's `AllocateVouchersResult` gained `created` (true only when the call created them; false for existing ones, a lost race, or failures) so a repeated run emits nothing. Placing the event in this workflow covers every route to allocation (both subscribers, the recovery job and retries). The subscriber `deliver-vouchers-on-allocated` runs `deliverOrderVouchersWorkflow` unless `delivery.automatic` is false (read from `getDeliverySettings`); the options loader rejects a value that is not a boolean, `null` included. Tests: `integration-tests/http/voucher-delivery-trigger.spec.ts` (6), `voucher-delivery-manual.spec.ts` (1), one loader unit test and one module test for the default.
- Red first: the event is emitted once; a repeated run emits nothing; end to end through the event; `delivery.automatic: false`; the loader rejecting a non-boolean. Passed on their first run, each checked against a mutant it fails on: Pool short emits nothing (mutant: failures report `created: true`); provider fails and delivery throws on its own (mutant: run delivery inline in the allocation workflow instead of the event, which fails the second); the default is true (mutant: default false).
- Deviations: test 5b ("allocates even when delivery throws an error of its own") was added because a provider failure is caught by the delivery workflow and so cannot show that delivery never blocks allocation. The test application turns automatic delivery off per spec file through `process.env.VOUCHER_TEST_DELIVERY_AUTOMATIC`, set at the top of the file, because the runner applies its `env` option only after loading the configuration (agreed with the owner); `voucher-delivery.spec.ts` now sets it too, since it runs the workflow itself. Two existing assertions on the whole allocation result gained `created: false`.
- Checked on a real screen in the dev app: order #4 bought through the storefront, captured in the admin, and its email arrived in Mailpit within the same minute with no manual step.
- Not done: retries of failed Deliveries (ticket 04) and Medusa fulfillment (ticket 05).
