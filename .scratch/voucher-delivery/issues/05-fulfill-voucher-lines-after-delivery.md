# 05: Fulfill an order's Voucher lines after its Delivery succeeds

**What to build:** When an order's email Delivery becomes delivered, whatever started it, the plugin creates Medusa's fulfillment of the order's Voucher lines for the delivered quantities and marks it delivered, so the admin shows the order as delivered instead of waiting to be shipped. Lines that are not Voucher products are left to the store. The shipping option comes from `delivery.fulfillment.shippingOptionId` (read on each fulfillment), else the order's shipping method; its linked stock location is used. A fulfillment that fails is logged and leaves the Delivery delivered; the retry and recovery job of ticket 04 tries it again without sending the email again, and skips canceled orders. Fulfillments carry `no_notification`. `delivery.fulfill` (default true) turns it off. The README recommends Voucher products without shipping and explains that an order whose Vouchers were delivered can only be refunded, not canceled. See "Fulfillment after a Delivery" and the following decisions in the delivery spec, and ADR-0005.

**Blocked by:** 04 (Retry failed Deliveries and recover missing ones).

**Status:** ready-for-agent

- [ ] Before the first test: confirm that a getter in plugin options reaches the plugin unchanged (the test application gives the shipping option id this way); if not, agree another way with the owner
- [ ] An order with only Voucher lines ends with its fulfillment status delivered, and each Voucher line fully fulfilled and delivered
- [ ] A mixed order fulfills and delivers only the Voucher lines; the other lines stay unfulfilled
- [ ] A failed Delivery creates no fulfillment
- [ ] With no shipping option configured and none on the order, the error is logged with the order id, the Delivery stays delivered and no email is sent again; once an option is available the job fulfills the order
- [ ] Running delivery or the job again creates no second fulfillment
- [ ] `delivery.fulfill: false` creates no fulfillment from the workflow or the job
- [ ] The fulfillment and its delivery are created with `no_notification`
- [ ] The job skips a canceled order whose fulfillment failed, after logging it once
- [ ] A cart of Voucher products without a shipping profile completes without a shipping method and is fulfilled
- [ ] README: the options, the recommended Voucher product setup, the shipping option and stock location requirement, and that a delivered order can be refunded but not canceled
- [ ] Checked on a real screen in the dev app (rule 13): storefront purchase, capture, email, then the order shown as delivered in the admin
- [ ] Tested at the delivery workflow and at the retry and recovery workflow against a real database
