# 02: Let module tests run in parallel checkouts

**What to build:** `src/modules/voucher/__tests__/service.spec.ts` passes `moduleName: VOUCHER_MODULE` to `moduleIntegrationTestRunner`, so every run uses the same database, `medusa-voucher-integration-<JEST_WORKER_ID>` (`@medusajs/test-utils/dist/module-test-runner.js`, `this.dbName = config.dbName ?? ...`). Two checkouts or worktrees running `pnpm test:integration:modules` at the same time drop and recreate each other's database. Give the runner a `dbName` that can differ per checkout, for example from an environment variable such as `VOUCHER_TEST_DB_NAME` with today's name as the default, so CI and a single checkout behave as now. HTTP tests are not affected: `medusaIntegrationTestRunner` names its database with a ulid when no `moduleName` is given.

**Why:** on 2026-10-26 two agents built admin tickets 07 and 09 in separate worktrees and had to take turns on the module tests through a lock file.

**Blocked by:** none.

**Status:** needs-triage

- [x] Two module test runs with different values of the variable, started at the same time, both pass (shown in the PR)
- [x] Without the variable, the database name and CI behaviour are unchanged
- [x] AGENTS.md (Environment) says how to run module tests in parallel checkouts
