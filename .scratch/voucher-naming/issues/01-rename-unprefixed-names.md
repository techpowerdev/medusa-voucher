# 01: Rename every host-visible name that lacks `voucher`

**What to build:** everything in the spec's Implementation Decisions in one PR: table rename migration keeping rows, model, admin paths and response keys, job/workflow/step ids, rule 17 in AGENTS.md (name workflow and step ids, drop the exception list), README. See `.scratch/voucher-naming/spec.md`.

**Blocked by:** none.

**Status:** done (PR #40)

- [x] `/admin/voucher-allocation-failures` lists and resolves failures with `voucher_allocation_failure(s)` keys; the old paths return 404 (HTTP tests)
- [x] The job, workflow and step ids are the new ones
- [x] Rows in `allocation_failure` survive the migration (shown on the dev host)
- [x] `pnpm db:generate` reports no new migration after the hand-written one
- [x] AGENTS.md rule 17 and README updated
- [x] Checked on a real screen with screenshots in the PR (rule 13)
