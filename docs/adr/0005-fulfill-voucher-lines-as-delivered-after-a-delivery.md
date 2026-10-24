# Fulfill an order's Voucher lines as delivered after its Delivery succeeds

When an order's Delivery succeeds, the plugin creates Medusa's fulfillment of the order's Voucher lines and marks it delivered at once. Without it the admin shows a paid, emailed order as waiting to be fulfilled, inviting a store to ship something that has already arrived.

## Considered options

- **Leave fulfillment to the store (document a manual step)**: rejected because every order would need a click in the admin, and an order left unfulfilled looks unfinished although the customer already holds the codes.
- **Create the fulfillment but do not mark it delivered**: rejected because sending an email has no shipped-but-not-arrived state; a Delivery is complete when the provider accepts the message, and the admin would keep showing the order as awaiting delivery.
- **Create the fulfillment at allocation**: rejected because the customer has received nothing yet; a failed send would show an order as fulfilled.
- **Fulfill as delivered after a successful Delivery (chosen)**: the admin matches what the customer has, a failed Delivery leaves the order visibly unfulfilled, and the Voucher lines are separated from any physical lines the store still has to ship.

## Consequences

- Medusa does not cancel an order with a fulfillment that is not canceled, and does not cancel a delivered fulfillment, so an order whose Vouchers were delivered can no longer be canceled. The store refunds it instead (Medusa refunds a payment without a return). This matches the situation: the customer already has the codes.
- Medusa needs a shipping option and a stock location to record any fulfillment, so the store configures one for Vouchers (`delivery.fulfillment.shippingOptionId`), or the order's own shipping method is used.
- A fulfillment that cannot be recorded never causes the email to be sent again; the retry job records it later.
- A store with its own fulfillment process turns this off with `delivery.fulfill: false`.
