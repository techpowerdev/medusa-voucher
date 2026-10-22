# 02: Send an order's Vouchers in one email

**What to build:** A workflow that sends a Paid order's first-time Allocations to its recipient email in one message through the Notification module's `email` channel, rendered by the plugin (subject, HTML, text) with each Voucher's code as text, a QR code as an inline image attachment, the PIN when present, the Partner and Face value, the validity days in the store's timezone and the Redemption instructions, plus the order's display number. A store can replace the email with `delivery.renderers.email`. It claims the order's Delivery first, so concurrent runs send once, and records the outcome: delivered (Vouchers move to Delivered) or failed (no recipient email, or the provider threw), with an error that contains no code. Codes never go into the notification's data. See the delivery spec.

**Blocked by:** 01 (Record Deliveries per order and channel).

**Status:** ready-for-agent

- [ ] One message per order with every first-time Allocation; content and inline QR as in the spec; the PIN only when present; the codes readable as text in the HTML and the text body
- [ ] On success the Delivery is delivered with its time and the order's Vouchers are Delivered; the idempotency key is the Delivery id with the attempt
- [ ] No recipient email, or a provider that throws, leaves the Delivery failed with a safe error and the Vouchers Allocated
- [ ] Concurrent runs for one order send one message
- [ ] An order that is no longer a Paid order, or is canceled, is not sent
- [ ] A renderer in the plugin options replaces the default email
- [ ] Medusa's notification table and the logs contain no code, PIN or hash after a send
- [ ] The test application configures the local provider on `email` (keeping `feed`); `qrcode` is a direct dependency
- [ ] The README explains the provider requirements and the `@perseidesjs/notification-nodemailer` setup, and the Gmail advice
- [ ] Tested at the delivery workflow against a real database, observing the provider's `send`
