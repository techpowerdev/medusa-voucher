# Build a partner voucher resale plugin instead of using Medusa's Loyalty or Promotion modules

Medusa ships gift cards and store credit in its Loyalty plugin, and discount codes in the Promotion module, but both model value owned by the store itself. This plugin resells codes issued by third-party partners (bought in advance, sold as products, delivered by email), which neither covers, so we build a separate plugin rather than extending them.

## Considered options

- **Use the Loyalty plugin's gift cards**: rejected because a gift card is a stored balance the store honours itself, not a code from another company that must be held in inventory and delivered.
- **Use Promotion codes**: rejected because a promotion is a discount on the store's own prices, not a product with a cost and stock.
