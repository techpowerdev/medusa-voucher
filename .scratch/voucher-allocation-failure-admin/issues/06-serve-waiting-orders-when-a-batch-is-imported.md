# 06: Serve waiting orders when a batch is imported

**What to build:** importing a Voucher batch, from the admin or `POST /admin/voucher-batches/import`, retries the open Allocation failures of that Voucher product right after storing the batch, with the existing retry, and returns its result `{ allocated, still_open, failed }` beside the batch and `imported`. If the retry throws as a whole, the import is kept and the response says the retry did not run (the retry must not fail the workflow, or Medusa would compensate the stored batch). The import dialog states how many waiting orders were served, or that the retry did not run. See `.scratch/voucher-allocation-failure-admin/spec.md` (user stories 14–18; Q4, Q8, Q9).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Importing a batch for a Voucher product with waiting orders allocates them oldest first and returns the retry result (HTTP test)
- [x] An order refunded or canceled while it waited stays open after the import (HTTP test)
- [x] When the retry is forced to throw (`jest.spyOn`), the Vouchers are still stored and the response says the retry did not run (HTTP test)
- [x] The import dialog shows the result in English and Thai
- [x] README's import section documents the retry and the new response field
- [ ] Checked on the dev host with screenshots: an import that serves a waiting order, then the Voucher product page and the email in Mailpit (rule 13)
