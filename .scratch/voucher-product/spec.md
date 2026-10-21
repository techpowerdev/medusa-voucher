Status: ready for tickets (not yet implemented)

# Voucher products

## Problem Statement

The store sells Vouchers as ordinary Medusa product variants, but the plugin cannot tell which variants those are. If a variant is only recognised once a Voucher batch exists for it, a customer can pay for a Voucher variant the store has not imported anything for, and the order is treated as an ordinary one: they pay and receive nothing, and nobody is told. The store owner must be able to say deliberately "this variant delivers Vouchers from this Partner at this Face value".

## Solution

A Voucher product is a record the plugin owns, linked to exactly one product variant. It states the Face value and the currency of the Vouchers it delivers; the Partner is already expressed by the Medusa product the variant belongs to. Operators create Voucher products explicitly, import Vouchers against them, and allocation applies to a variant exactly when it is linked to a Voucher product. Everything else in the order flow is left to Medusa.

## User Stories

1. As a store owner, I want to mark a variant as a Voucher product with its Face value and currency, so that the system knows what it delivers.
2. As a store owner, I want a variant to belong to at most one Voucher product, so that there is no ambiguity about what a purchase delivers.
3. As a store owner, I want a Voucher product to need an existing variant, so that I cannot mark something that cannot be sold.
4. As an operator, I want to import Vouchers against a Voucher product, so that a batch always belongs to something deliberately marked.
5. As an operator, I want the import refused when the Voucher product does not exist, so that no stray Vouchers are created.
6. As an operator, I want each Voucher batch to record only what varies per purchase (cost, purchase date, reference, Redemption instructions), so that the Face value is stated once.
7. As an operator, I want to list Voucher products and see how many Vouchers each has Available, so that I can see what can be sold.
8. As a store owner, I want a paid order line for a Voucher product with an empty Pool to produce a visible Allocation failure, so that a customer is never silently left with nothing.
9. As a store owner, I want order lines for variants that are not Voucher products left alone, so that ordinary products are unaffected.
10. As a store owner, I want to unlink or change a Voucher product's Face value and currency only while it has no Vouchers, so that existing Vouchers never contradict their product.
11. As a developer, I want the Voucher product to be the place to add per-product settings later (such as a minimum remaining validity), so that future rules do not need a data migration.

## Implementation Decisions

- A new data model `VoucherProduct` in the voucher module holds Face value (a decimal amount), currency code and an identifier. A module link connects it to Medusa's product variant (`ProductModule.linkable.productVariant`; confirmed to exist in the installed Medusa), one-to-one. The link definition lives with the plugin and a host application creates its table with `medusa db:migrate`.
- Voucher batches reference a Voucher product. Partner, Face value and currency are removed from the Voucher batch (the Partner is dropped from the data model altogether, since the Medusa product already says whose voucher it is); Face value and currency are read from the Voucher product. The cost, purchase date, reference, Redemption instructions and importer stay on the batch.
- Each Voucher keeps a copy of its variant's id, set at import from the Voucher product's variant, so the Pool of a variant can be queried without joins (as today). It never changes after import.
- The CSV import API takes the Voucher product instead of a variant, Partner, Face value and currency. The workflow checks the Voucher product exists, then proceeds as before.
- Creating a Voucher product requires the variant to exist and not already be linked. The Face value and currency of a Voucher product can be edited only while it has no Vouchers.
- Admin API (thin routes over a workflow): create, list (with the count of Available Vouchers per product) and update a Voucher product. The responses never contain Voucher codes, PINs or hashes.
- Allocation (see the allocation spec) treats a variant as a Voucher product exactly when it is linked to one.
- ADR-0003 records the decision and the options considered.
- The glossary term Voucher product already matches this meaning ("a product variant whose purchase delivers Vouchers of one Face value"); the Voucher batch definition changes to say that the Face value and currency come from the Voucher product, and the Partner is described as represented by the Medusa product.
- To verify while building: that a link from the plugin's module to Medusa's product module registers and can be queried in a host application, with a real integration test. If it cannot, fall back to a validated field on the variant, and revise ADR-0003.

## Testing Decisions

- A good test drives the public API and the workflow and asserts what exists afterwards and what the caller sees; it does not assert on how the link table is laid out.
- Proposed seam (to confirm with the owner): the admin API routes, against a real Medusa application loading the built plugin, as in `integration-tests/http/plugin.spec.ts`. One seam.
- Cases: create a Voucher product for a real variant; refuse an unknown variant; refuse a second Voucher product for the same variant; import against a Voucher product; refuse an import against an unknown one; the list shows the Available count; editing Partner or Face value refused once Vouchers exist; no secret in any response.
- A module-level test covers the model and the link query with a real database.
- Prior art: the existing CSV import HTTP tests and the module tests with a real database.

## Out of Scope

- An admin page to create and manage Voucher products (the API exists; the page does not).
- Creating the Medusa product and variant itself; operators do that with Medusa's own tools and then mark the variant.
- Per-product minimum remaining validity (the place for it is reserved, the setting is not built).
- Shopper-facing stock that reflects eligible Vouchers.
- Migrating data created before this change: the plugin has not been released, so no migration of existing data is provided.

## Further Notes

- This reverses part of what the Voucher batch carried (Partner, Face value, currency; the Partner is removed outright) and so changes the CSV import spec: its batch details become "a Voucher product plus cost, purchase date, reference and Redemption instructions".
- A store that wants several Face values of one Partner creates one Medusa product with a variant per Face value, each linked to its own Voucher product; the Pool of each is separate.
- Reports by Partner group by Medusa product. If a seller or issuer separate from the product must be recorded later, a nullable column can be added; until then the batch `reference` can carry it.
