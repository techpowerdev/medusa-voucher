# 03: Start allocation when the payment is fully captured

**What to build:** When an order's payment has been captured in full, allocation starts for that order without anyone doing anything. A partly captured or only authorized payment does not release any Voucher. First prove, against the installed Medusa, which ids the payment-captured event carries and how a captured payment maps to its order and how to know the order is fully paid; the answer decides the design, so write it down in the allocation spec before building if it differs from what the spec assumes.

**Blocked by:** 01 (Allocate Vouchers to an order, all or none).

**Status:** done (feature/allocate-on-payment-captured, pending review)

- [x] A written finding (in the allocation spec) of what the capture event carries and how the order and its paid status are determined
- [x] A fully captured payment for an order with Voucher products results in those Vouchers allocated, with no manual step
- [x] An authorized-but-uncaptured payment, and a partial capture, allocate nothing
- [x] The same event delivered twice allocates once (tested by running the workflow twice, not by delivering the event twice)
- [x] An order with no Voucher product lines is left alone
- [x] A thin end-to-end test in a host application shows the capture event starting allocation; the rules themselves stay tested at the workflow (plus one for `order.placed`, see the spec's finding)

## Comments

- 2026-10-22: the finding in the spec changed the design with the owner's approval: a second subscriber on `order.placed` covers providers that capture when authorizing, which emit no `payment.captured`.
- 2026-10-22, not tested: a real `completeCartWorkflow` with a provider that captures at authorization (the `order.placed` test emits the event for an order captured through the Payment module, since the system provider cannot auto-capture); a `payment.captured` for a payment with no order (the subscriber returns early); an order refunded before the event is handled (Medusa's status is then a refund status, so nothing is allocated, by reading of `getLastPaymentStatus` only).
