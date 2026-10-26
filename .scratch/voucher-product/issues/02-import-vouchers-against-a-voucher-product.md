# 02: Import vouchers against a Voucher product

**What to build:** The CSV import takes a Voucher product instead of a variant, Partner, Face value and currency. A batch can only be created for a Voucher product that exists, and records only what varies per purchase: cost, purchase date, reference, Redemption instructions and who imported it. The Partner field disappears from the data model altogether. Everything else about the import (file format, whole-day dates, all-or-nothing, line-numbered errors, no codes in responses) stays as it is.

**Blocked by:** 01 (Voucher product linked to a variant).

**Status:** done (feature/voucher-import-by-product, pending review)

- [x] The import API accepts a Voucher product and the per-purchase details, and refuses an unknown Voucher product without creating anything
- [x] A successful import creates the batch and Vouchers for that Voucher product; each Voucher carries the variant of its Voucher product, as before
- [x] The batch no longer stores Partner, Face value or currency, and the Partner field is gone from the whole data model; a new migration is generated and committed with no drift
- [x] Existing behaviours still hold and stay tested: duplicate codes, repeated codes, all-or-nothing, line numbers, the whole-day dates and time zone, 2,500-code import, concurrent import
- [x] The HTTP integration test covers the new request shape, including the unknown Voucher product and an unauthenticated request
- [x] README, the CSV import spec and any example request reflect the new shape
