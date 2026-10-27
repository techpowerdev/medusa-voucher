# 07: Concurrent allocation of one order survives a deadlock

**What to build:** when several allocation runs for the same order happen at the same moment (for example `order.placed` and `payment.captured` arriving together, or the recovery job), every run ends with the same Allocations, even when PostgreSQL aborts one of them with a deadlock. Today only a unique-index violation is handled; a deadlock escapes as an error.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent (approved by the user on 2026-10-27, Q17)

## What happens today

- `integration-tests/http/voucher-allocation.spec.ts`, "allocates an order once when it is run several times at the same moment", runs three allocations of one order at once. It usually passes, but on 2026-10-27 one full run failed with `DeadlockException ... insert into "voucher_allocation" ... deadlock detected` (Process A waits for ShareLock on B's transaction; B waits on A's). Rerunning the file passed 3 times out of 3.
- `allocateVouchers` (module service) catches only a unique violation: after the losing run's transaction rolls back, it reads the winner's Allocations (or open failures) and returns them. PostgreSQL may instead resolve the clash by aborting one transaction with a deadlock (SQLSTATE `40P01`), which is not caught, so that run's workflow fails and the subscriber logs an error. The order still ends with one set of Allocations (the winner commits), but the losing caller sees a failure.

## Proposed behaviour

- A deadlock (`40P01`) during allocation is retried: the run starts again in a new transaction, a few times at most (3). On the retry it either finds the winner's committed Allocations (returned unchanged, `created: false`) or reaches the existing unique-violation path. No new data, no change to the all-or-none rule.
- If it still deadlocks after the last try, the error is thrown as today (the recovery job catches the order later).

## Acceptance criteria

- [ ] A deadlock during allocation is retried and the run returns the order's Allocations (test forcing a deadlock error once, e.g. `jest.spyOn` on the insert, so it does not depend on timing)
- [ ] After the maximum tries the deadlock error is thrown (test)
- [ ] The existing concurrent test passes repeatedly (run the file several times; report the count)
- [ ] Only allocation is affected; imports keep their own unique-violation handling
