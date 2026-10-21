# Mark Voucher products with a plugin model linked to the variant

A product variant is a Voucher product only when the plugin has a `VoucherProduct` record linked to it through a Medusa module link. Voucher batches are imported against a Voucher product, and the Face value and currency live on the Voucher product, not on each batch. The plugin does not store the Partner at all: a store sells one Medusa product per Partner (for example a Lotus voucher) with a variant per Face value (100, 500), so the product already says who the Partner is. An order line is allocated Vouchers exactly when its variant is linked to a Voucher product.

## Considered options

- **Treat a variant as a Voucher product once a batch exists for it**: rejected because a variant sold before anything was imported looks like an ordinary product, so a paying customer receives nothing and nobody is told.
- **A flag in the variant's `metadata`**: rejected because it is free-form data anyone can edit or mistype, it cannot be validated or queried reliably, and the plugin's money-handling logic should not depend on a field it does not own.
- **A linked `VoucherProduct` model (chosen)**: the marker is structured data the plugin owns, linked the way Medusa connects modules, so it can be validated, queried and extended (a per-product minimum remaining validity can be added later as a column).

## Consequences

- A variant that is not linked is never allocated, by design: the store owner decides what is a Voucher product. Allocating for a linked variant whose Pool is empty is a visible Allocation failure, never silence.
- The import flow takes a Voucher product, so a batch can only exist for a variant that was deliberately marked.
- Face value and currency move from the Voucher batch to the Voucher product, and the Partner field is removed entirely. A Voucher product is, by definition, one Face value of what its Medusa product sells. The Voucher batch keeps what varies per purchase: cost, purchase date, reference and Redemption instructions.
- Storing the Partner again would duplicate the Medusa product and could drift from it ("Lotus" against a Thai spelling). Reports by Partner group by Medusa product. If a separate seller or issuer ever has to be recorded, adding a column later is cheap, whereas removing a stored one is not; the batch `reference` can carry a purchase order or seller meanwhile.
- This changes the data model and the import API that already exist, so it needs a new migration and a change to the CSV import (see the Voucher product spec).
- The plugin now defines a module link to Medusa's Product module, so a host application must run `medusa db:migrate` to create the link table.
