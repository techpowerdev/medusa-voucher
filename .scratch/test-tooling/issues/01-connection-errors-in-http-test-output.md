# 01: Connection errors in the HTTP test output

**What to find out:** Every run of `pnpm test:integration:http` prints `Connection Error: Connection ended unexpectedly` several times, locally and in CI (44 times in the log of PR #10's run), while all tests pass. Find which connection ends (the test runner's database setup or teardown, the app's pool, or a module), and either fix the cause or record why it is harmless, so that a real connection failure is not lost in the noise.

**Blocked by:** none.

**Status:** done (PR #53; harmless, nothing to change)

- [x] The source of the message is identified
- [x] Either it no longer appears, or a note here explains why it is expected

## Comments

- 2026-10-23, lead (read, not proved): `medusaIntegrationTestRunner` restores the database from a template before every test (`@medusajs/test-utils/dist/medusa-test-runner.js`, `beforeEach` → `dbUtils.restore`), which would end the application's open pool connections; that matches one burst of messages per test.
- 2026-10-27, answer (checked against `@medusajs/test-utils` 2.21.2 and knex 3.2.10, and by running the tests):
  - **Who ends the connection:** the test runner. Before the first test, `beforeEach` snapshots the database into a template (`createPostgresDatabaseTemplate`); before every later test it drops the database and recreates it from that template (`restorePostgresDatabaseFromTemplate`). Both run `pg_terminate_backend` on every connection to the test database (`dist/medusa-test-runner-utils/postgres-template.js`), including the idle ones in the app's knex pool.
  - **Who prints it:** knex. A pooled connection that the server closes is marked `__knex__disposed = 'Connection ended unexpectedly'` (`lib/dialects/postgres/index.js:84-88`); the next time the pool hands it out, it logs `Connection Error: …` as a warning, throws the connection away and opens a new one (`lib/client.js:288-293`). No query runs on the dead connection.
  - **Measured:** `voucher-pool-lists.spec.ts` with one test (`-t "refuses an unknown"`) printed 6 messages, all after the app booted and before the test's first request; the whole file (9 tests) printed 17. All tests passed both times.
  - **Why it is harmless:** it is one warning per idle connection the runner killed, and knex replaces each one. A real connection failure still shows up as a failing query or test, not only as this warning. Filtering the message out (a knex `log.warn` in `integration-tests/medusa-config.ts`) was not done, since it would also hide the same warning in a real failure.

