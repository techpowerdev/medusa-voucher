# 02: Send an order's Vouchers in one email

**What to build:** A workflow that sends a Paid order's first-time Allocations to its recipient email in one message through the Notification module's `email` channel, rendered by the plugin (subject, HTML, text) with each Voucher's code as text, a QR code as an inline image attachment, the PIN when present, the Partner and Face value, the validity days in the store's timezone and the Redemption instructions, plus the order's display number. A store can replace the email with `delivery.renderers.email`. It claims the order's Delivery first, so concurrent runs send once, and records the outcome: delivered (Vouchers move to Delivered) or failed (no recipient email, or the provider threw), with an error that contains no code. Codes never go into the notification's data. See the delivery spec.

**Blocked by:** 01 (Record Deliveries per order and channel).

**Status:** done (feature/voucher-delivery-email, pending review)

- [x] One message per order with every first-time Allocation; content and inline QR as in the spec; the PIN only when present; the codes readable as text in the HTML and the text body
- [x] On success the Delivery is delivered with its time and the order's Vouchers are Delivered; the idempotency key is the Delivery id with the attempt
- [x] No recipient email, or a provider that throws, leaves the Delivery failed with a safe error and the Vouchers Allocated
- [x] Concurrent runs for one order send one message
- [x] An order that is no longer a Paid order, or is canceled, is not sent
- [x] A renderer in the plugin options replaces the default email
- [x] Medusa's notification table and the logs contain no code, PIN or hash after a send
- [x] The test application configures the local provider on `email` (keeping `feed`); `qrcode` is a direct dependency
- [x] The README explains the provider requirements and the `@perseidesjs/notification-nodemailer` setup, and the Gmail advice
- [x] Tested at the delivery workflow against a real database, observing the provider's `send`

## Comments

- 2026-10-23, built: `deliverOrderVouchersWorkflow` checks the Paid order rule (moved from the allocation workflow to `workflows/utils/paid-order.ts` as `isPaidOrder`, unchanged) and runs `sendOrderVouchersStep`, which claims the Delivery, renders, sends and records the outcome through the new service methods `completeDelivery` and `failDelivery`. The renderer and timezone come from the module service (`getDeliverySettings`), which already holds the plugin options; the email types moved to the module's `types.ts`. Tests: `integration-tests/http/voucher-delivery.spec.ts` (13).
- Red first: one message per order, content, PIN, QR, delivered statuses, no email, provider throws, canceled, refunded, store renderer, and an order without Vouchers. Passed on their first run: concurrent runs (the claim already existed) and no secrets in the notification table and logs (codes were never put into `data`); each was checked against a mutant that it fails on.
- Concurrency finding: with the claim removed, Medusa's idempotency key alone still stopped the duplicate (the second run used the same `<delivery id>:1` key while the first row was pending). The test fails only when both are removed, and passes with the claim alone and a unique key per run; so it proves the outcome, and the claim's own exclusivity rests on ticket 01's module tests.
- Added beyond the agreed cases: a Paid order without Vouchers created a Delivery and sent an empty email; it now gets no Delivery (test went red first).
- Test fix stated: the no-email test first ran with the order still having an email, because the helper's default parameter also applied to an explicit `undefined`; the helper now takes `email: null`, and the test was rerun red against the step without the email check.
- Not done here: validating `delivery.renderers.email` at startup (a non-function value would fail at send time, as a failed Delivery); `delivery.automatic`, the `voucher.allocated` event and the subscriber are ticket 03.

