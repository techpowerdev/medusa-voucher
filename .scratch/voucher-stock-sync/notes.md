# Voucher stock sync (idea, not planned)

**Status:** idea, not planned. Not a spec: before any work, grill it, write `spec.md` and tickets, and get them approved (AGENTS.md rule 7).

Notes from a discussion on 2026-10-27, kept so a later version can start from here instead of from scratch. The decision for now is [ADR-0006](../../docs/adr/0006-sell-beyond-the-pool-and-settle-allocation-failures-afterwards.md): sell beyond the Pool with Medusa's inventory management off, and settle Allocation failures afterwards.

## The idea

Let Medusa count Voucher stock, so the storefront shows a Voucher product as sold out when its Pool has no Available Vouchers and Medusa refuses the sale, instead of the order becoming an Allocation failure.

## What Medusa supports

From [Configure Selling Products](https://docs.medusajs.com/resources/commerce-modules/product/selling-products) (applies from Medusa 2.5.1):

- An item that does not ship but whose stock Medusa counts is a supported case ("Digital products, such as licenses, that don't require shipping but have a limited quantity"): the product has no shipping profile or the variant's inventory item has `requires_shipping: false`, and the variant has `manage_inventory: true`.
- Whether a line requires shipping: the inventory item's `requires_shipping` first (when the variant has one), else whether the product has a shipping profile.

Checked in Medusa 2.21.2 (`node_modules/@medusajs/*`):

- The inventory item's `requires_shipping` defaults to `true` (`@medusajs/inventory/dist/models/inventory-item.js`), so it must be set to `false`.
- Medusa reserves stock when the cart completes (`reserveInventoryStep` in `core-flows/dist/cart/workflows/complete-cart.js`), before payment is captured.
- A fulfillment takes its location from the input or the shipping option's stock location, and fulfills each reserved item at the reservation's location (`core-flows/dist/order/workflows/create-fulfillment.js`).

## What it would take

1. **Two counts kept equal.** The Pool and Medusa's stocked quantity change together on every import (+), expiry (-, the `mark-expired-vouchers` job runs every 15 minutes), void (-), Replacement (planned, -), and when a Voucher drops under `minimumRemainingValidityDays`. That last one is worked out when read, with no event, so a scheduled job would have to recompute it. Anyone can also edit the stock in Medusa's inventory page and make the counts drift.
2. **Different moments.** Medusa reserves when the order is placed, the plugin allocates when it is paid, and Medusa deducts stock at fulfillment, which the plugin records after the email Delivery. Stocked quantity is therefore not simply the Available count; Vouchers allocated but not yet fulfilled must be counted too, or units are counted twice or not at all.
3. **Unpaid orders hold stock.** An order authorized but not captured (for example the system provider, which only authorizes) keeps its reservation until it is canceled, so a product can show sold out while its Pool still has codes.
4. **One location.** The reservation is made at a location of the sales channel that has stock, and the fulfillment deducts there. Voucher stock must sit on the same location as the Voucher shipping option (`delivery.fulfillment.shippingOptionId`), or stock is deducted in the wrong place or the fulfillment fails. Several sales channels or locations need care.
5. **Overselling is reduced, not removed.** A count updated late (expiry between job runs) or edited by hand still lets an order through, so Allocation failures and their retry and resolve stay needed.
6. **Harder host setup.** `manage_inventory` on, an inventory item with `requires_shipping: false` and stock on the right location; the plugin would own the stocked quantity, and stores already set up with inventory off need a migration path or instructions.

## Open questions for the grilling

- Who owns the stocked quantity: only the plugin, or may staff adjust it?
- Which number becomes stock: Available only, or Available plus allocated-but-unfulfilled?
- Is a 15-minute lag acceptable for expiry and the minimum-validity rule, or must it be exact at checkout?
- What happens to reservations of orders that are never paid?
- Is a lighter option enough: hide or unpublish a Voucher product when its Pool is empty, or a Low stock alert (already planned)?

## Evidence from the discussion

Dev host, 2026-10-27, customer with an account, Voucher product without a shipping profile and inventory off:

- Order #3, a Voucher and a T-shirt with Standard Shipping only: placed; the Voucher line was fulfilled through "Email delivery" and marked delivered; the T-shirt stayed unfulfilled.
- Order #5, only a Voucher and no shipping method (placed through the store API): placed while the Pool was empty, became an open Allocation failure; after importing a batch, `POST /admin/voucher-products/:id/retry-allocation-failures` allocated it, the email was sent and the line was fulfilled.
