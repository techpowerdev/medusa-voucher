# Record each Delivery separately from the Allocations it sends

A Delivery is its own record: one order sent on one channel, with its recipient, status, attempts, last error and delivery time. The Allocation no longer carries delivery fields. All of an order's Vouchers are sent together in one message, so the state of a send belongs to the order and the channel, not to each Voucher.

## Considered options

- **Delivery fields on each Allocation (the first model)**: rejected because it allows one channel and one status per Voucher. Sending an order by email and by LINE, or sending it again after a customer lost the email, would overwrite the history or need new columns, and claiming a send against concurrent runs would have to update every Allocation of the order consistently.
- **The Notification module's records as the only history**: rejected because Medusa stores a notification's data in plain JSON (codes must stay out of it), offers no per-order view, and does not know which Allocations a message carried or whether the order still has to be sent.
- **A Delivery record per order and channel (chosen)**: one row to claim with a single conditional update, so concurrent runs send once; one place for attempts and errors that a retry job and an admin page read; and room for another channel or a resend without changing the model.

## Consequences

- The delivery columns are removed from the Allocation by a migration. Nothing reads or writes them yet, so no data is lost.
- A Voucher becomes Delivered when a Delivery of its order succeeds on any channel; a failed Delivery leaves it Allocated with its order.
- The automatic Delivery is unique per order and channel. A later manual resend can be a new attempt on the same record; whether resends need records of their own is decided with the admin pages.
- LINE (planned) adds rows on the `line` channel and its own renderer and provider; the model does not change.
