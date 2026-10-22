# 04: Retry allocation failures and resolve them

**What to build:** After importing more Vouchers, an operator retries the open Allocation failures of a Voucher product and the waiting orders are allocated, oldest first. A failure is closed automatically when its order is allocated, or by an operator with a note and their identity when settled another way (for example a refund). Retrying uses the same all-or-none allocation as a new order. Nothing runs automatically after an import in this slice.

**Blocked by:** 01 (Allocate Vouchers to an order, all or none).

**Decided 2026-10-22 with the owner (Q1–Q6):** see Allocation failure and Retry in the allocation spec. Seams: `retryAllocationFailuresWorkflow` (oldest first, repeat, refunded order, automatic resolve) and the admin API over HTTP (list, retry, resolve, 401, 404, 422, no secrets).

**Status:** ready-for-agent

- [ ] An authenticated admin operation retries the open Allocation failures of a Voucher product
- [ ] Failures are tried oldest first; a failure whose order can now be fully allocated is allocated and marked resolved; one that still cannot be covered stays open
- [ ] Retrying twice in a row allocates nothing extra
- [ ] An operator can resolve a failure with a note; it records who and when
- [ ] The admin API lists open Allocation failures with the order, the Voucher product and the units requested and available
- [ ] No response contains a Voucher code, PIN or hash
- [ ] Tested through the admin API in a host application, plus the oldest-first ordering at the workflow
