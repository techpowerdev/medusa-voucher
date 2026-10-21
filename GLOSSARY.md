# Voucher

A Medusa plugin for reselling vouchers issued by third-party partners. The store buys voucher codes from a partner in advance, sells them to customers as ordinary products, and delivers one code per purchased unit.

## Language

**Voucher**:
A single redeemable code issued by a Partner, with a face value and an expiry date, that the store sells and delivers to a customer.
_Avoid_: Coupon, gift card, promo code, discount code

**Partner**:
The third-party brand or retailer that issues a Voucher and honours it (for example a supermarket or coffee chain). A Partner is data, never a concept the plugin treats specially.
_Avoid_: Brand, vendor, supplier, issuer

**Voucher batch**:
One purchase of Vouchers from a Partner, imported together and sharing the Partner, face value, currency, purchase cost, purchase date and reference.
_Avoid_: Lot, import, stock

**Face value**:
The amount the Partner will honour when the Voucher is redeemed, regardless of the price the customer paid.
_Avoid_: Denomination, price

**Voucher product**:
A product variant sold in the store whose purchase delivers Vouchers of one Partner and one Face value.
_Avoid_: Voucher SKU, voucher item

**Pool**:
The Vouchers that exist for one Voucher product, in any status.
_Avoid_: Inventory, stock

### Lifecycle

**Available**:
A Voucher that is in the Pool and can still be sold.
_Avoid_: In stock, unused

**Allocation**:
The assignment of one Voucher to one purchased unit of an order. A purchase of several units allocates several Vouchers, all or none.
_Avoid_: Reservation, assignment, claim

**Allocated**:
A Voucher assigned to an order but not yet confirmed as received by the customer.
_Avoid_: Reserved, sold

**Delivery**:
Sending the Voucher code of an Allocation to the customer through a channel. Delivery can fail and be retried.
_Avoid_: Dispatch, fulfilment, shipment

**Delivered**:
A Voucher whose code has been sent to the customer successfully.
_Avoid_: Sent, redeemed

**Expired**:
A Voucher past its expiry date, which can no longer be sold or honoured.
_Avoid_: Stale, dead

**Void**:
A Voucher withdrawn from use because it is invalid or has been replaced.
_Avoid_: Cancelled, deleted, invalid

**Replacement**:
Voiding a Delivered Voucher that did not work and delivering a new Voucher from the same Pool to the same customer, with a recorded reason.
_Avoid_: Reissue, swap, refund

**Minimum remaining validity**:
The shortest time left before expiry for which a Voucher may still be sold, so customers receive Vouchers they have time to use.
_Avoid_: Shelf life, grace period

**Allocation failure**:
A paid order for which not enough Available Vouchers existed at Allocation time. It requires a person to decide how to resolve it.
_Avoid_: Out of stock, failed order

### Reporting

**Low stock**:
A Pool whose Available Vouchers have fallen below a configured threshold.
_Avoid_: Running out

**Expiring soon**:
A Voucher whose expiry date falls within a configured warning window.
_Avoid_: Near expiry

## Relationships

- A **Partner** issues many **Vouchers**; each **Voucher** belongs to exactly one **Voucher batch** and one **Voucher product**.
- A **Voucher batch** is bought from one **Partner** and contains **Vouchers** for one **Voucher product**.
- A **Pool** is the set of **Vouchers** of one **Voucher product**.
- An **Allocation** links one **Voucher** to one purchased unit of an order; a **Delivery** sends the code of that **Allocation**.

## Boundaries

- A Voucher is not store credit, a gift card of the store, or a Promotion. Those are separate Medusa concepts and are not replaced by this plugin.
- Redeeming a Voucher happens at the Partner, outside the store. The plugin does not observe redemption, so there is no "redeemed" status.
