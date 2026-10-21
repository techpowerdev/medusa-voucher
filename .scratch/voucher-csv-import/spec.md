Status: implemented (written retroactively; code in PR #4)

# Import Vouchers from a CSV file

## Problem Statement

The store buys Vouchers from a Partner in bulk, often thousands at a time, as a spreadsheet of codes with the dates the Partner honours them. An operator needs to load that file as one Voucher batch without hand-typing codes, without a mistake silently moving an expiry, and without a half-imported file that is hard to clean up. Codes are secrets, so the process must never display or log them.

## Solution

An operator uploads the file's text together with the Voucher batch details (Partner, Voucher product, Face value, currency, purchase date and cost, Redemption instructions). The system checks the whole file first. If every row is valid, it creates the Voucher batch and all its Vouchers; if anything is wrong it creates nothing and lists every problem by line number, so the file can be fixed in one pass. Dates are plain calendar dates and count as whole days.

## User Stories

1. As an operator, I want to import a Partner's file as one Voucher batch, so that all its Vouchers share the Partner, Face value, cost and purchase date.
2. As an operator, I want each batch tied to an existing Voucher product, so that the Pool of that product is the Vouchers I imported.
3. As an operator, I want the import refused when the Voucher product does not exist, so that I never create Vouchers nobody can sell.
4. As an operator, I want the file to need only a `code` column, so that Partners without PINs or dates are easy to import.
5. As an operator, I want optional `pin`, `valid_from` and `valid_until` columns, so that I can record a PIN and a Validity period per Voucher.
6. As an operator, I want header names in any letter case and files with a byte-order mark or Windows line endings accepted, so that exports from spreadsheet programs just work.
7. As an operator, I want blank lines ignored, so that trailing newlines do not cause errors.
8. As an operator, I want unknown columns rejected, so that a misspelt `valid_untill` is not silently dropped.
9. As an operator, I want dates written as `YYYY-MM-DD` or `DD-MM-YYYY`, so that I can paste what the Partner sent.
10. As an operator, I want a date to mean the whole of that day, so that "valid until 31-12-2026" lets customers use the Voucher all through 31 December.
11. As an operator, I want a time, a two-digit year, or a date that does not exist (30 February) rejected, so that an expiry is never moved silently.
12. As an operator, I want an end date before the start date rejected, so that no Voucher is born already unusable.
13. As an operator, I want a code repeated inside the file rejected, so that one code is never stored twice.
14. As an operator, I want a code that is already stored, in any earlier batch or from any Partner, rejected, so that I cannot sell the same code twice.
15. As an operator, I want the whole file refused when any row is invalid, so that I never have to work out which half was imported.
16. As an operator, I want every problem listed with its line number, so that I can fix the file in one pass.
17. As an operator, I want the list of problems capped and summarised ("and N more"), so that a badly broken file stays readable.
18. As an operator, I want errors to name lines and never show codes or PINs, so that secrets do not leak into screens, logs or tickets.
19. As an operator, I want a very large file (up to 50,000 Vouchers) accepted and larger ones refused with advice to split, so that one request cannot exhaust the server.
20. As an operator, I want two imports running at once that share a code to fail cleanly with nothing imported, so that the duplicate rule holds under concurrency.
21. As an operator, I want the response to show the batch and the number imported but no codes, so that the response is safe to display and store.
22. As an operator, I want the import to record who made it, so that there is an audit trail.
23. As a store owner, I want the time zone used for dates to be one setting for the store, so that "whole day" means the same everywhere.

## Implementation Decisions

- The import is a workflow with ordered steps: confirm the Voucher product exists, read the CSV, create the Voucher batch, create the Vouchers. A failure in the last step undoes the Voucher batch. The CSV is read before anything is written.
- One admin route accepts a JSON body with the batch details and the CSV as text. It is not a multipart upload, because the plugin cannot rely on the upload middleware Medusa's own routes use; the admin reads the chosen file and sends its text. The route is authenticated by Medusa's admin authentication, and the actor becomes `imported_by`.
- The response is `{ voucher_batch, imported }`. It never contains codes, PINs or hashes.
- CSV columns: `code` required; `pin`, `valid_from`, `valid_until` optional; anything else rejected. Codes and PINs are trimmed.
- Dates: `YYYY-MM-DD` or `DD-MM-YYYY` only. A date is the whole day in the store's time zone: the Validity period starts at 00:00 on the valid-from date and ends at 00:00 on the day after the valid-until date.
- A Validity period is stored as two instants and means `valid_from <= now < valid_until`, the same half-open interval Medusa uses for its own campaigns and price lists (checked in Medusa's promotion and pricing modules). The data model has no date-only type, and a text date was tried and dropped in favour of this. An empty period (`valid_until` not after `valid_from`) is refused by the service and by a database check constraint.
- The time zone is a plugin option `timezone` (an IANA zone), default `Asia/Bangkok`, validated when the application starts. Changing it affects only later imports; stored instants never move. Conversion uses the platform's `Intl` support, so no date library is added.
- JavaScript turns a day that does not exist into the next month's date without an error, so the parser checks the calendar date itself.
- Duplicate detection uses the keyed hash of the code described in ADR-0002 and is global across Partners and batches. Existing hashes are looked up in chunks so a large import stays within database limits. A unique-violation raised by a racing import is translated into a plain message that does not repeat the hash.
- Errors report 1-based CSV line numbers (the file's own lines, header included). When the Vouchers come from a file, the service names lines instead of positions.
- A file may hold at most 50,000 Vouchers.
- The CSV reader is the `csv-parse` library (MIT), the same one Medusa uses.

## Testing Decisions

- A good test drives the public behaviour (the route and the service's import method) and checks outcomes: what was stored, what the caller sees, and that no secret appears in any response or error. It does not assert on private helpers' internals.
- The highest seam is the admin HTTP route, run against a real Medusa application that loads the built plugin with a real database. It covers: successful import with no code in the response, a bad file creating no batch and naming its line, a duplicate with an already-stored code rolling the batch back, an unknown Voucher product, and an unauthenticated request.
- The CSV reader and the time-zone arithmetic are pure and covered by unit tests: both date formats, month and year ends, a different zone, daylight saving, impossible dates, wrong column counts, BOM and Windows line endings, and that errors never echo a code or PIN.
- The service import method is covered by module tests against a real database, including a 2,500-code import, a concurrent-import race and the database constraint.
- Prior art: the existing module tests and `integration-tests/http/plugin.spec.ts`.

## Out of Scope

- An admin page for choosing a file and showing the result (the API exists; the page does not).
- Multipart upload and streaming of files larger than 50,000 Vouchers.
- Per-Voucher Redemption instructions (they belong to the whole batch).
- Allocation, Delivery and QR codes (see the next specs).
- Re-importing or editing a batch after it was created.
- A per-batch or per-request time zone.

## Further Notes

- Valid-until display must subtract a day: the stored instant is the first moment the Voucher no longer applies, while people read the last day it can be used.
- The Thai-timezone default matches the first store this plugin serves; set `timezone` explicitly for other markets.
