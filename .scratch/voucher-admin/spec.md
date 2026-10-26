Status: ready for tickets (not yet implemented). Depends on the Voucher product, CSV import and allocation specs.

# Admin pages for Voucher products, imports and the Pool

## Problem Statement

Everything a store does with Vouchers goes through the admin API: marking a variant as a Voucher product, importing a CSV of codes into a Voucher batch, and finding out how many Vouchers are left. A store owner using Medusa's admin has no page for any of it, so they cannot set up a Voucher product, restock it, or see that it is running out without calling the API by hand. The one number the API gives, `available_vouchers`, also counts Vouchers that have expired or have too little validity left to be sold, so it overstates what the store can sell.

## Solution

The plugin adds admin pages in Medusa's dashboard. A widget on a product variant's page marks the variant as a Voucher product and shows its Face value and how many Vouchers are Available. A "Vouchers" page in the sidebar lists every Voucher product with its counts, and each Voucher product has a page with its counts by status, its Voucher batches, its Vouchers and an import dialog for a CSV file. Available means what GLOSSARY.md says, a Voucher that can still be sold, so Vouchers past their Validity period or under the Minimum remaining validity are counted apart. Codes are never shown.

## User Stories

1. As a store owner, I want to mark a variant as a Voucher product from the variant's page, with its Face value and currency, so that I do not need the API to set one up.
2. As a store owner, I want the currency to default to my store's default currency, so that I rarely have to choose it.
3. As a store owner, I want to see a Voucher product's Face value and how many Vouchers are Available on the variant's page, so that I know at a glance whether it can be sold.
4. As a store owner, I want to change the Face value only while the Voucher product has no Vouchers, as the API already allows, so that I cannot change the value of codes already bought.
5. As a store owner, I want a Vouchers page in the sidebar listing every Voucher product with its Partner, variant, Face value and counts, so that I see all my stock in one place.
6. As a store owner, I want Available to count only Vouchers that can still be sold, so that the number matches what customers can buy.
7. As a store owner, I want Expired Vouchers and Vouchers under the Minimum remaining validity counted apart from Available, so that I see what I paid for but can no longer sell.
8. As a store owner, I want Allocated, Delivered and Void counts per Voucher product, so that I can follow what was sold.
9. As a store owner, I want a page per Voucher product with its counts, its Voucher batches and its Vouchers, so that I can review its Pool.
10. As a store owner, I want each Voucher batch shown with its purchase date, unit cost, reference and counts by status, newest first, so that I can tell my purchases apart.
11. As a store owner, I want each Voucher shown with its status, batch, first and last usable day in my time zone, and the order it went to, so that I can answer a customer's question without seeing the code.
12. As a store owner, I want to filter the Vouchers by status or batch and see the soonest to expire first, a page at a time, so that I find the ones that matter.
13. As a store owner, I want to import a CSV file into a new Voucher batch from the Voucher product's page, with the purchase date, unit cost, reference and Redemption instructions, so that I can restock without the API.
14. As a store owner, I want the purchase date to default to today and the Redemption instructions to start as those of the latest batch, so that a routine restock takes little typing.
15. As a store owner, I want to see the file's name and how many rows it has before importing, never its codes on screen, so that I can check I picked the right file.
16. As a store owner, I want the result to say how many Vouchers were imported, or list each problem with its line number, so that I can fix the file and try again.
17. As a store owner reading Thai or English, I want the pages in my admin's language, so that my staff can use them.
18. As a store owner, I want no page or response to show a code, PIN or hash, so that opening the admin never exposes a Voucher.

## Implementation Decisions

- **Counts (Available per GLOSSARY.md):** a Voucher counts as Available when its status is `available`, its Validity period has not ended, and it has at least the Minimum remaining validity counted from the later of now and its start, the same rule allocation uses to choose Vouchers. A Voucher whose status is `available` but whose Validity period has ended counts as Expired; one still valid but under the Minimum remaining validity counts apart under that name. Allocated, Delivered and Void follow the status. Counts are computed when read, so they are right between runs of the job below; under the Minimum remaining validity is never stored, since it depends on an option the store can change.
- **Turning Vouchers Expired:** a scheduled job marks `available` Vouchers whose Validity period has ended as `expired` (GLOSSARY.md's Expired; an ended Validity period never comes back). Allocated and Delivered Vouchers keep their status. It cannot race allocation, which only takes Vouchers whose Validity period has not ended.
- **`GET /admin/voucher-products`:** `available_vouchers` changes to the Available count above. The README states the change.
- **`GET /admin/voucher-products/:id`:** returns the Voucher product with its variant, the Medusa product's title and the counts above.
- **`GET /admin/voucher-products/:id/batches`:** the Voucher product's batches, newest purchase first, each with purchase date, unit cost, reference, Redemption instructions and counts by status, paginated.
- **`GET /admin/voucher-products/:id/vouchers`:** the Voucher product's Vouchers, each with id, status as counted above (`available`, `expired`, `under_minimum`, `allocated`, `delivered`, `void`), `code_hint` (the code's last characters, kept at import to be shown masked; never the code), batch (id, reference and, since ticket 10, `purchased_day`, the purchase day in the plugin's `timezone`, so the page can name a batch that has no reference), first and last usable day in the plugin's `timezone` (null when that end is open), and for an allocated or delivered one the order's id and display number; filterable by status (including Expired and under minimum) and by batch; ordered by valid-until, soonest first and open-ended last; 20 per page by default.
- **Import:** the dialog posts to the existing `POST /admin/voucher-batches/import`; the file is read in the browser and sent as the `csv` text. Changed with ticket 07: the dialog sends the purchase date as a day alone (`YYYY-MM-DD`), which the route stores as the start of that day in the plugin's `timezone` (a date and time is still stored as given), and the batches list adds `purchased_day`, that day in the plugin's `timezone`, which the page shows. The browser counts the file's data rows for display and shows no row's content. Problems come back from the API with line numbers and never codes: the error keeps its message and adds `problems` (the first 20, each with its `line`, a stable `code` and, for some codes, the `column` or the row limit `max`) and `problem_count`, and the dialog shows each problem in the admin's language, or the message alone for any other error (ticket 09). The 50,000-row limit stays.
- **Secrets:** no new response or page contains a code, PIN or hash, only `code_hint`, shown masked; codes stay readable only through `revealVoucher`.
- **Variant widget:** shown on the product variant page. For a variant that is not a Voucher product it offers to mark it (Face value, currency defaulting to the store's default currency) through `POST /admin/voucher-products`. For one that is, it shows the Face value, the Available count and a link to the Voucher product's page, and allows changing the Face value or currency through `POST /admin/voucher-products/:id` only while it has no Vouchers. No way to unmark in this spec.
- **Vouchers page:** a route in the admin sidebar listing Voucher products with Partner (product title), variant title, Face value, Available, Expired, under Minimum remaining validity, Allocated and Delivered, ordered by product title. No create button; marking happens on the variant's page.
- **Language:** every label goes through the admin i18n in English and Thai.
- **Vocabulary:** GLOSSARY.md terms (Voucher, Voucher product, Voucher batch, Pool, Available, Allocated, Delivered, Expired, Void, Face value, Validity period, Minimum remaining validity, Redemption instructions, Partner). No new term.

## Testing Decisions

- The new and changed admin routes are built test first, as HTTP integration tests against a real database, asserting what an admin client receives: counts that treat expired and under-minimum Vouchers apart, batches and Vouchers with the fields above in the stated order and pages, filters, and no `code`, `pin` or hash field anywhere in a response.
- The admin pages have no automated tests (the repository has no UI test tooling and this spec does not add one). Each page is checked on a real screen in the dev app with screenshots in its pull request (AGENTS.md rule 13).

## Out of Scope

- Allocation failures in the admin (list, retry, resolve); the API exists and pages come later.
- Low stock and expiring-soon alerts.
- Showing or revealing a code or PIN in the admin.
- Unmarking a Voucher product, voiding a Voucher, Replacement.
- Editing or deleting a Voucher batch.

## Further Notes

- Decided with the owner on 2026-10-24 (grilling Q1–Q15). Added with ticket 02: `code_hint` is shown, list statuses are the counted ones, and Vouchers are turned Expired by a job (ticket 06, before ticket 03).
- **Finding:** nothing in the plugin sets a Voucher's status to `expired`; allocation skips expired and under-minimum Vouchers while choosing, which is why counts are computed when read.
- Follow-ups agreed with the owner on 2026-10-25 after tickets 01–06: ticket 08 (type-check the admin in CI) first, then 07 (a batch's purchase date in the plugin's time zone) and 09 (import problems in the admin's language, keeping the error message as it is).
