Status: ready for tickets (not yet implemented). Depends on the allocation spec.

# Deliver Vouchers to customers by email

## Problem Statement

A customer who has paid for Voucher products is allocated Vouchers, but nothing sends them the codes. They have paid and received nothing they can use. The store needs to send each Paid order's Vouchers to the customer without anyone doing it by hand, never lose an order on the way, never send a code to an order that was refunded, and never leave the codes lying in plain text in the database or the logs along the way. The store sends email through its own SMTP account (Gmail or a webmail host) rather than an email service, and expects to send through LINE as well later.

## Solution

Once an order's Vouchers are allocated, the plugin sends the customer one email with all of them: for each Voucher the code as text and as a QR code, the PIN as text when there is one, the Partner and Face value, the dates it can be used and the Redemption instructions. The email goes through Medusa's Notification module to whatever email provider the store configured, rendered by the plugin so that the codes never travel in the notification's stored data. Each send is recorded as a Delivery of the order on a channel. A send that fails is tried again automatically, a few times, and a Paid order whose Delivery never started is found and sent. A store can turn automatic sending off. Once a Delivery succeeds, the plugin records Medusa's fulfillment of the order's Voucher lines as delivered, so the admin shows the order as delivered rather than waiting to be shipped.

## User Stories

1. As a customer, I want my Vouchers emailed to me as soon as my payment is captured, so that I can use them right away.
2. As a customer who bought several Vouchers, I want them all in one email, so that none goes missing among many messages.
3. As a customer, I want each Voucher's code as text and as a QR code, so that I can type it or have it scanned.
4. As a customer, I want the PIN as text when the Voucher has one, so that I can redeem it.
5. As a customer, I want to see which Partner and Face value each Voucher is for, so that I know what I hold.
6. As a customer, I want the first and last day each Voucher can be used, in the store's dates, so that I do not miss it.
7. As a customer, I want the Partner's Redemption instructions in the email, so that I know how to use the Voucher.
8. As a customer, I want the order number in the email, so that I can match it to my purchase.
9. As a customer whose email client blocks images, I want the codes as readable text, so that I can still use them.
10. As a customer, I want to receive the email once, so that I am not confused by duplicates.
11. As a store owner, I want codes never stored in plain text in Medusa's notification records or logs, so that a database dump or a log does not leak them.
12. As a store owner, I want to send through my own SMTP account with a community Nodemailer provider, so that I do not need an email service.
13. As a store owner, I want to write the email myself, in my language and with my branding, so that it looks like my store.
14. As a store owner, I want a sensible default email in English, so that delivery works before I customise it.
15. As a store owner, I want to turn automatic delivery off, so that I can launch before my email provider is set up, or send by hand later.
16. As an operator, I want a failed send tried again automatically a few times, so that a passing SMTP error or a daily sending limit does not need me.
17. As an operator, I want a send that keeps failing to stop and stay visible, so that I can decide what to do.
18. As an operator, I want a Paid order whose delivery never started (a subscriber that failed or an event that never arrived) to be found and sent, so that no paying customer is forgotten.
19. As an operator, I want an order without an email address recorded as a failed Delivery with that reason, so that I know to contact the customer.
20. As an operator, I want the error of a failed send recorded without any code in it, so that I can diagnose it safely.
21. As a store owner, I want no codes sent for an order that was refunded or canceled after it was allocated, so that I do not give away Vouchers I was not paid for.
22. As a store owner, I want a Voucher marked Delivered once the email provider accepted the message, so that I can see what was sent.
23. As a store owner, I want a Voucher whose delivery failed to stay with its order, so that the customer who paid still owns it.
24. As a developer, I want delivery to be its own record per order and channel, so that LINE can be added and an order can be sent again without changing the data model.
25. As a developer, I want the delivery workflow exported, so that an admin page or the host application can send an order by hand.
26. As a developer, I want delivery to start from an event the plugin emits after allocation, so that a slow or failing email provider never blocks or rolls back an allocation.
27. As a store owner, I want an order whose Vouchers were delivered shown as delivered in the admin, so that I do not try to ship it or wonder whether it is done.
28. As a store owner selling Vouchers alongside physical products, I want only the Voucher lines marked delivered, so that I still see what I have to ship.
29. As a customer buying only Vouchers, I want checkout without choosing a shipping method, so that I am not asked how to ship an email.
30. As an operator, I want a fulfillment that could not be recorded tried again without emailing the customer again, so that the admin catches up without duplicates.
31. As a store owner who fulfills orders another way, I want to turn the plugin's fulfillment off, so that it does not clash with my own process.
32. As a store owner, I want no "shipped" or "delivered" emails from my own subscribers triggered by the plugin's fulfillment, so that the customer gets only the Voucher email.
33. As an operator, I want to know that an order whose Vouchers were delivered cannot be canceled, only refunded, so that I handle a refund request the right way.

## Implementation Decisions

- **Delivery is its own record (ADR-0004):** a Delivery records one order sent on one channel: order, channel, recipient, status (pending, sending, delivered, failed), number of attempts, last error and when it was delivered. The automatic Delivery is unique per order and channel. The delivery columns on the Allocation (channel, status, attempts, error, delivered at) are removed by a migration; nothing uses them yet. GLOSSARY.md defines Delivery as sending an order's Allocations together in one message.
- **What a Delivery sends:** every Allocation of the order that serves a unit for the first time (Replacements are not part of this spec), in one message, with the order's display number.
- **Content per Voucher:** the code as readable text and as a QR code of the code alone (never the PIN, GLOSSARY.md), the PIN as text when there is one, the Partner (the Medusa product's title) and the Face value with its currency, the validity dates shown as whole days in the store's `timezone` (the last day it can be used, since valid-until is the first instant it no longer applies), and the Voucher batch's Redemption instructions.
- **Rendering:** the plugin renders the email itself as a subject, an HTML body and a plain-text body, and passes them as the notification's content, with each QR code as an inline image attachment referenced by its content id (not a data URI, which Gmail blocks). The codes are never put in the notification's data or provider data, because Medusa stores those as plain JSON in its notification table and the local provider logs them. A store replaces the default English email with a renderer function per channel in the plugin options (`delivery.renderers.email`), which receives the order and the Voucher list and returns the subject, HTML and text. The codes always appear as text, so a missing image never hides them.
- **Email provider:** the plugin ships none. The host application configures the Notification module's `email` channel; Medusa allows one provider per channel, and that provider serves every email of the store. The README recommends `@perseidesjs/notification-nodemailer` (registered as `@perseidesjs/notification-nodemailer/providers/nodemailer`) and states what any provider must support: content subject and HTML, attachments with an id and inline disposition, and not logging the content. Medusa's default configuration has only a local provider on the `feed` channel, so without configuration every send fails.
- **Trigger:** when an allocation creates new Allocations, the plugin emits `voucher.allocated` with the order id after the allocation commits (a repeated run that returns existing Allocations emits nothing). A plugin subscriber runs the delivery workflow for the order. A slow or failing provider never affects the allocation.
- **Paid order check:** the delivery workflow sends only for a Paid order that is not canceled, with the same rule the allocation trigger uses, both on the first send and on every retry.
- **Claiming a send:** before sending, the workflow moves the order's Delivery on the channel to sending and increments its attempts in one conditional update that matches only a pending or failed Delivery (or creates it pending first). Only the caller whose update changed the row sends, so concurrent runs send once. The notification's idempotency key is the Delivery id with the attempt number, so a later attempt is not skipped by Medusa as a duplicate of an earlier one.
- **Outcome:** when the provider accepts the message the Delivery becomes delivered with its time, and the order's Vouchers move from Allocated to Delivered. When the send throws, or the order has no recipient email, the Delivery becomes failed and the Vouchers stay Allocated with their order. The error recorded on the Delivery is the error's type and Medusa's message; the provider's full message is written to the error log with the order's codes removed.
- **Automatic retry and recovery:** a scheduled job, every 15 minutes, sends again the Deliveries created in the last 7 days that failed with fewer than 5 attempts or have been sending for more than 10 minutes (a process that died mid-send, marked failed with `Sending was interrupted` first, so one interrupted at its 5th attempt stays failed), and creates and sends the Delivery of every order that has first-time Allocations but no email Delivery, among orders allocated between 7 days and 10 minutes ago. It reads a page at a time and keeps one order's error from stopping the others, as the allocation recovery job does. A Delivery that reached 5 attempts stays failed for an operator.
- **Turning it off:** the plugin option `delivery.automatic` (default true). When false, neither the subscriber nor the job sends anything or creates any Delivery; the exported delivery workflow still sends an order when called.
- **Fulfillment after a Delivery (ADR-0005):** whenever an order's email Delivery becomes delivered, whatever started it (the subscriber, the retry job or a direct call of the workflow), the plugin creates a Medusa fulfillment of the order's Voucher lines for the quantities it delivered and marks it delivered at once, with no shipped step, through Medusa's order fulfillment workflows. Other lines are left to the store, so a mixed order shows as partially delivered. A failed Delivery creates no fulfillment.
- **Shipping option and stock location:** Medusa needs both to create a fulfillment even for items that do not require shipping. The plugin uses the shipping option given by `delivery.fulfillment.shippingOptionId` and the stock location linked to it; without the option, the order's own shipping method; with neither, the fulfillment fails as below. The option is read each time a fulfillment is created, not once at startup. At startup it can only be checked to be a non-empty string, since the database is not available while options load; a wrong id shows up as a failed fulfillment.
- **When the fulfillment fails:** the Delivery stays delivered and the email is never sent again for it; the failure is logged as an error with the order id and the reason. The retry and recovery job also finds orders with a delivered email Delivery whose Voucher lines are not fully fulfilled and tries the fulfillment again. A canceled order is logged once and skipped, not tried on every run.
- **No duplicate fulfillment:** before creating one, the plugin reads the Voucher lines' fulfilled and delivered quantities from Medusa and fulfills or marks only what is missing. The Delivery stores no fulfillment id (Medusa already knows). Medusa takes no lock when creating a fulfillment; since only the run that claimed the Delivery sends, a race is left to the rare case of the job meeting a live run, where the second creation fails on the quantity check and is logged as a warning.
- **No notifications:** fulfillments are created and marked delivered with `no_notification`, so a store's own subscribers on Medusa's fulfillment or delivery events do not email the customer a second time.
- **Turning it off:** the plugin option `delivery.fulfill` (default true). When false, no fulfillment is created by the delivery workflow or the job.
- **Consequence for canceling:** Medusa refuses to cancel an order with a fulfillment that is not canceled, and refuses to cancel a delivered fulfillment, so once its Vouchers are delivered an order can no longer be canceled; the store refunds it instead (Medusa refunds a payment without a return). The README states this.
- **Voucher products without shipping:** the README recommends Voucher products with no shipping profile and with inventory management off, so a cart of Vouchers completes without a shipping method; Voucher products that do require shipping still work, using the order's shipping method.
- **QR codes:** generated from the code at send time with the `qrcode` package (a new direct dependency) and never stored.
- **Secrets:** delivery decrypts codes only through `revealVoucher`; no response, log, notification data or error stored by this feature contains a code, PIN or hash.
- **Vocabulary:** GLOSSARY.md terms (Delivery, Delivered, Allocated, QR code, Paid order, Redemption instructions). Delivery changes to sending an order's Allocations together (done during the design).

## Testing Decisions

- A good test sets up a Paid order with Allocations, runs delivery, and asserts what the customer would receive (one message with every Voucher, its content and QR attachments) and what is recorded (Delivery status, attempts, Voucher status), not how the email is built.
- **Seams (agreed with the owner):** the delivery workflow, run against a real database in the test application with the local provider configured on the `email` channel and its `send` observed with a spy; the retry and recovery workflow behind the job, taking the current time as input; and thin end-to-end tests that an allocation leads to a delivery through the event and that `delivery.automatic: false` sends nothing.
- Cases: one message per order with every Voucher; content and inline QR; PIN shown only when present; Delivered statuses; no recipient email; a provider that throws; concurrent runs send once; an order no longer Paid is not sent; a store renderer replaces the default; the notification table and the logs contain no code, PIN or hash; retry of failed and stale sending Deliveries; the attempt limit; recovery of an order with no Delivery; the window; one order's error not stopping the others.
- The test application's configuration adds the local provider on the `email` channel and keeps `feed`.
- Fulfillment (agreed with the owner): the same delivery workflow seam, asserting what Medusa reports for the order (its fulfillment status, and each line's fulfilled and delivered quantities), and the retry and recovery workflow for a fulfillment that failed. Cases: a Vouchers-only order ends delivered; a mixed order fulfills only the Voucher lines; a failed Delivery creates none; a missing shipping option logs an error, keeps the Delivery delivered, and the job fulfills the order once one is available; running again creates no second fulfillment; `delivery.fulfill: false` creates none; the fulfillment carries `no_notification`; a canceled order is skipped by the job. The test application gives the shipping option id through a getter so each test can supply its own; that Medusa keeps a getter in plugin options is to be checked before the first test.
- Prior art: the allocation workflow tests and the recovery job tests in the HTTP integration suite; the logger and service spies used there.

## Out of Scope

- Sending through LINE (its own spec: a LINE user id linked to the customer, a QR image served from a signed, expiring URL since LINE cannot take attachments, and a plugin LINE provider that receives a reference rather than the codes).
- An email provider of the plugin's own; the Nodemailer provider is the host's choice.
- Admin pages to view Deliveries and send an order again, and alerts.
- Replacement of a Voucher that did not work.
- A store API or account page where customers view their Vouchers.
- Bounces and read receipts; Delivered means the provider accepted the message.
- Translations of the default email.
- Fulfilling lines that are not Voucher products, and returns of delivered Vouchers.

## Further Notes

- **Finding, Medusa fulfillment (Medusa 2.21.2 source read 2026-10-24, not run):** creating an order fulfillment needs a shipping option (given, or the order's first shipping method) and a stock location (given, or the option's), even for items that do not require shipping; it rejects a request mixing items that do and do not require shipping, fulfills part of an order, and throws when asked for more than is left to fulfill. A variant with inventory management needs a stock reservation. Marking delivered needs no shipped step and refuses a fulfillment already delivered. The order's fulfillment status is computed on read from its fulfillments and line quantities. Canceling an order requires every fulfillment canceled, and a delivered fulfillment cannot be canceled; refunding a payment needs no return. Core Medusa sends no notification on fulfillment events. A cart whose items do not require shipping (a product without a shipping profile and without inventory management) completes without a shipping method. The admin's "awaiting fulfillment" badge belongs to line items with quantity left to fulfill.

- **Finding, Medusa's Notification module (checked against Medusa 2.21.2 source, 2026-10-23, not run):** each notification is stored with `data` and `provider_data` as plain JSON and there is no option to skip it; `content` and attachments have no columns. The local provider logs `data`. Sending is synchronous: the row is created pending, the provider is called, and a failure is stored and thrown to the caller. An idempotency key that already has a pending or successful row is skipped without being returned, a failed one is sent again, and there is no lock, so concurrent sends with one key can race.
- **Finding, `@perseidesjs/notification-nodemailer` 3.2.0 (source read 2026-10-23):** it uses the content's subject and HTML and ignores the plain text when HTML is present; it maps attachments to Nodemailer with `cid` from the attachment id and inline disposition, decoding base64; it does not read `data`. Its repository is archived on GitHub and it declares Medusa `>=2.13.0` but was built against 2.14.1, so it must be tried against the store's Medusa before launch. It is about 200 lines and easy to fork if needed.
- **Gmail:** a store sending through Gmail keeps every sent code in the account's Sent folder and is limited to a few hundred recipients a day; the README should advise a dedicated sending account with two-step verification and an app password.
- Medusa's default configuration loads the Notification module with only a local provider on `feed`; a host that declares the module replaces that default.
