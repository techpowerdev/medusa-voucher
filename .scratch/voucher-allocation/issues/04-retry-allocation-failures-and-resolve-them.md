# 04: Retry allocation failures and resolve them

**What to build:** After importing more Vouchers, an operator retries the open Allocation failures of a Voucher product and the waiting orders are allocated, oldest first. A failure is closed automatically when its order is allocated, or by an operator with a note and their identity when settled another way (for example a refund). Retrying uses the same all-or-none allocation as a new order. Nothing runs automatically after an import in this slice.

**Blocked by:** 01 (Allocate Vouchers to an order, all or none).

**Decided 2026-10-22 with the owner (Q1–Q6):** see Allocation failure and Retry in the allocation spec. Seams: `retryAllocationFailuresWorkflow` (oldest first, repeat, refunded order, automatic resolve) and the admin API over HTTP (list, retry, resolve, 401, 404, 422, no secrets).

**Status:** done (feature/retry-allocation-failures, pending review)

- [x] An authenticated admin operation retries the open Allocation failures of a Voucher product
- [x] Failures are tried oldest first; a failure whose order can now be fully allocated is allocated and marked resolved; one that still cannot be covered stays open
- [x] Retrying twice in a row allocates nothing extra
- [x] An operator can resolve a failure with a note; it records who and when
- [x] The admin API lists open Allocation failures with the order, the Voucher product and the units requested and available
- [x] No response contains a Voucher code, PIN or hash
- [x] Tested through the admin API in a host application, plus the oldest-first ordering at the workflow

## Comments

- 2026-10-22, built: an allocation now resolves its order's open failures (`resolved_by: system`, note "Allocated") in the same transaction, by any route. Tests that passed on their first run: oldest first, retried twice, canceled while waiting (the code already ordered and applied the Paid order rule; oldest first was confirmed red by flipping the order to DESC), listing by Voucher product and the 401.
- 2026-10-22, review: Medusa's generated `updateAllocationFailures` with a selector lists the rows and then updates them (`medusa-internal-service.js`), so two admins resolving the same failure at once could both succeed and the second note overwrite the first. The race test went red once in three runs; resolving is now one `UPDATE ... WHERE status = 'open'` through the transaction's knex, for both a person and the automatic resolve, and passed five runs in a row.
- 2026-10-22, review, fixed with the owner's approval: the retry did not isolate orders, so one order that threw failed the request with 500 and the later orders were not tried. Each order is now tried on its own; one that throws is logged as an error and listed in a new `failed` field of the response.
