# Sell beyond the Pool and settle Allocation failures afterwards

A Voucher product is sold with Medusa's inventory management off, so the store keeps selling it when its Pool has no Available Vouchers. Such an order becomes an Allocation failure, and a person settles it afterwards: by importing more Vouchers and retrying it, or by canceling and refunding it, whichever suits the case. The plugin does not keep Medusa's stock in step with the Pool.

## Considered options

- **Keep Medusa's inventory in step with the Pool**: Medusa supports items that do not ship but whose stock it counts (an inventory item with `requires_shipping` false), and the storefront would then show a Voucher product as sold out. Rejected because the plugin would have to change the stocked quantity on every import, allocation, expiry, void and minimum-validity change, with two counts of the same Vouchers that can drift apart; Medusa reserves stock when the order is placed while the plugin allocates when it is paid; and the stock would sit on a location that every fulfillment then has to match.
- **Sell beyond the Pool and settle the failures afterwards (chosen)**: the Pool stays the only count, nothing has to be kept in step, and a shortfall is visible as an open Allocation failure, and the store chooses per order between buying more codes and refunding.

## Consequences

- The storefront never shows a Voucher product as sold out. A customer can pay for a Voucher the store does not have, and waits until a person settles the order.
- Every open Allocation failure needs a person: import more Vouchers and retry (`POST /admin/voucher-products/:id/retry-allocation-failures`), or cancel and refund the order and resolve the failure with a note.
- Keeping the Pool stocked is the store's job; the planned Low stock alert is the warning that a Pool is running out.
- A store that must never oversell can still hide or unpublish a Voucher product whose Pool is empty; the plugin does not do it.
- Counting stock in Medusa can be added later without undoing this. What it would take, with the Medusa behaviour checked so far, is in `.scratch/voucher-stock-sync/notes.md`.
