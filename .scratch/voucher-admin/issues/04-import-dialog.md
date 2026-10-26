# 04: Import a CSV from the Voucher product page

**What to build:** an import dialog on the Voucher product page: purchase date (default today), unit cost (optional), reference, Redemption instructions (starting as the latest batch's) and a CSV file whose name and data-row count are shown but never its content. It posts to the existing `POST /admin/voucher-batches/import` and shows either how many Vouchers were imported (the page's counts and lists refresh) or each problem with its line number. English and Thai. See "Import" in the admin spec.

**Blocked by:** 03 (Vouchers pages in the admin).

**Status:** done (PR #28)

- [x] A valid file creates a batch and the page shows the new counts
- [x] A file with problems imports nothing and lists the line numbers, never a code
- [x] Defaults: today's date and the latest batch's Redemption instructions
- [x] English and Thai labels
- [x] Checked on a real screen in the dev app with screenshots (rule 13)
