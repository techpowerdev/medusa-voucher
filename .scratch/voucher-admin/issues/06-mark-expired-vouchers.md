# 06: Turn Vouchers past their Validity period Expired

**What to build:** a scheduled job (every 15 minutes, like the other jobs) runs a workflow that marks `available` Vouchers whose Validity period has ended (`valid_until <= now`) as `expired`, in one conditional UPDATE through a service method, and logs how many it marked. Allocated and Delivered Vouchers keep their status. The workflow takes the current time as input; the job only calls it. The Pool counts and lists already treat such Vouchers as expired when read, so they stay right between runs. See "Turning Vouchers Expired" in the admin spec.

**Blocked by:** 02 (List a Voucher product's batches and Vouchers). Done before 03.

**Status:** done (PR #26)

- [x] An `available` Voucher whose Validity period ended before `now` becomes `expired`; one ending after `now`, or open-ended, is left alone
- [x] Allocated, Delivered and Void Vouchers are never changed
- [x] Running it again changes nothing
- [x] The workflow takes `now`; the job only calls it
- [x] Tested at the workflow against a real database
