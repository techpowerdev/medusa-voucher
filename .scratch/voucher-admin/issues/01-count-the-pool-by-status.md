# 01: Count a Voucher product's Pool by status

**What to build:** `GET /admin/voucher-products/:id` returns the Voucher product with its variant, the Medusa product's title and its counts: Available (status `available`, Validity period not ended, at least the Minimum remaining validity from the later of now and its start, as allocation chooses), Expired (status `available`, Validity period ended), under Minimum remaining validity, Allocated, Delivered and Void. `available_vouchers` in `GET /admin/voucher-products` becomes the Available count; the README says so. See "Counts" in the admin spec.

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] Counts treat an expired Voucher and an under-minimum Voucher apart from Available, and a Voucher not yet valid but with enough validity left as Available
- [ ] `available_vouchers` in the list equals the Available count
- [ ] An unknown id is refused with 404
- [ ] No response contains a code, PIN or hash
- [ ] Tested through the admin routes against a real database
