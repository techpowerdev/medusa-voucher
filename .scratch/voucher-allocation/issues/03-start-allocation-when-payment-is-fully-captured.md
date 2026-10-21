# 03: Start allocation when the payment is fully captured

**What to build:** When an order's payment has been captured in full, allocation starts for that order without anyone doing anything. A partly captured or only authorized payment does not release any Voucher. First prove, against the installed Medusa, which ids the payment-captured event carries and how a captured payment maps to its order and how to know the order is fully paid; the answer decides the design, so write it down in the allocation spec before building if it differs from what the spec assumes.

**Blocked by:** 01 (Allocate Vouchers to an order, all or none).

**Status:** ready-for-agent

- [ ] A written finding (in the allocation spec) of what the capture event carries and how the order and its paid status are determined
- [ ] A fully captured payment for an order with Voucher products results in those Vouchers allocated, with no manual step
- [ ] An authorized-but-uncaptured payment, and a partial capture, allocate nothing
- [ ] The same event delivered twice allocates once
- [ ] An order with no Voucher product lines is left alone
- [ ] A thin end-to-end test in a host application shows the capture event starting allocation; the rules themselves stay tested at the workflow
