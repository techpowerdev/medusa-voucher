# 09: Show the import's problems in the admin's language

**What to build:** when `POST /admin/voucher-batches/import` refuses a file, its error keeps today's `message` unchanged and adds a list of the problems, each with its line number and a stable problem code (for example a bad date, an empty code, a code repeated in the file or already stored, an unknown column), never a code or PIN. The import dialog shows each problem from that list in the admin's language, English or Thai, and falls back to the message when the list is absent. The README lists the problem codes.

**Blocked by:** none (follows 04).

**Status:** ready-for-agent

- [ ] A refused import returns the same `message` as before plus the problems with line numbers and codes, and no Voucher code or PIN, tested through the admin route against a real database
- [ ] Every problem the CSV parser reports has a code, tested at the parser
- [ ] The import dialog shows each problem in English or Thai, and the message alone for any other error
- [ ] README lists the problem codes
- [ ] Checked on a real screen in the dev app with screenshots (rule 13)
