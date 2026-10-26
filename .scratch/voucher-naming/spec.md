# Spec: Namespace every name the host sees with `voucher`

**Status:** ready-for-agent

## Problem Statement

Several `@khumkha/medusa-*` plugins run in one Medusa app and share its database, workflow engine, scheduled jobs and admin API. A few names this plugin gives the host do not say `voucher` (AGENTS.md rule 17 lists three; workflow and step ids add three more), so another plugin could pick the same name and collide. v0.1.0 has just been released and no shop uses it yet, so renaming now costs the least.

## Solution

Rename every host-visible name that lacks `voucher`, keep the stored data, and release the change as 0.2.0 with the admin API path change called out in the release notes.

## User Stories

1. As a shop running several `@khumkha/medusa-*` plugins, I want every table, route, job, workflow and step of this plugin to say `voucher`, so that no two plugins collide.
2. As a shop upgrading from 0.1.0, I want my Allocation failures kept when the table is renamed, so that no open failure is lost.
3. As an admin integrator, I want the Allocation failure routes under `/admin/voucher-allocation-failures`, so that the path says whose resource it is.
4. As an admin integrator, I want the response keys to match the model (`voucher_allocation_failure(s)`), so that path and body read the same.
5. As a developer calling the exported workflows, I want their TypeScript names unchanged, so that my code keeps compiling.
6. As a maintainer, I want rule 17 to name workflow and step ids explicitly and to drop its list of exceptions, so that new code follows it.

## Implementation Decisions

- Table `allocation_failure` → `voucher_allocation_failure`, model `AllocationFailure` → `VoucherAllocationFailure`; id prefix `vfail` unchanged. The migration renames the table, its indexes and constraints (hand-written: a generated migration would drop and recreate the table and lose rows).
- Admin routes `/admin/allocation-failures` and `/admin/allocation-failures/:id/resolve` → `/admin/voucher-allocation-failures` and `/admin/voucher-allocation-failures/:id/resolve`; the old paths are removed, not aliased. `POST /admin/voucher-products/:id/retry-allocation-failures` stays.
- Response keys `allocation_failures` / `allocation_failure` → `voucher_allocation_failures` / `voucher_allocation_failure`.
- Ids: job, workflow and step `recover-unallocated-paid-orders` → `recover-unallocated-voucher-orders`; workflow and step `resolve-allocation-failure` → `resolve-voucher-allocation-failure`; workflow `retry-allocation-failures` and step `retry-orders-waiting-on-failures` → `retry-voucher-allocation-failures` (the two workflow ids were found while building, under Q1's "every id lacking voucher").
- Exported TypeScript names (`recoverUnallocatedPaidOrdersWorkflow`, `retryAllocationFailuresWorkflow`, …) stay.
- GLOSSARY unchanged (the term Allocation failure keeps its meaning).
- Release 0.2.0 right after merge, with the `.tgz` attached and the path change in the notes.

## Testing Decisions

- Test behaviour at the admin route and the workflows against a real database (prior art: `integration-tests/http/allocation-failures-admin.spec.ts`, `allocation-recovery.spec.ts`, `allocation-retry.spec.ts`).
- Seams to confirm with the user before the first test (rule 8).
- Data kept across the rename is shown on the dev host: count failures before and after `db:migrate` (rule 13 evidence with `psql`, the new path in the browser, the old path 404, the job's new name in the backend log).

## Out of Scope

- An admin page for Allocation failures.
- Module tests in parallel checkouts (`test-tooling 02`): built next, on a branch stacked on this one, and released in 0.2.0 too.

## Further Notes

Decided with the user on 2026-10-26 (grilling Q1–Q11).
