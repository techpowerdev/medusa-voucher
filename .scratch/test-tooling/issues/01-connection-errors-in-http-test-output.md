# 01: Connection errors in the HTTP test output

**What to find out:** Every run of `pnpm test:integration:http` prints `Connection Error: Connection ended unexpectedly` several times, locally and in CI (44 times in the log of PR #10's run), while all tests pass. Find which connection ends (the test runner's database setup or teardown, the app's pool, or a module), and either fix the cause or record why it is harmless, so that a real connection failure is not lost in the noise.

**Blocked by:** none.

**Status:** needs-triage

- [ ] The source of the message is identified
- [ ] Either it no longer appears, or a note here explains why it is expected

## Comments

- 2026-10-23, lead (read, not proved): `medusaIntegrationTestRunner` restores the database from a template before every test (`@medusajs/test-utils/dist/medusa-test-runner.js`, `beforeEach` → `dbUtils.restore`), which would end the application's open pool connections; that matches one burst of messages per test.
