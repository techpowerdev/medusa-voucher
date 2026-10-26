# 10: Name a batch without a reference in the Vouchers table

**What to build:** on a Voucher product's page, the Vouchers table's Batch column shows "-" for a Voucher whose batch has no reference, so the store owner cannot tell which batch it came from. The batch filter on the same table already names such a batch by its purchase day. Make the column name the batch the same way: its reference, or else its purchase day in the plugin's `timezone`, formatted as the filter formats it.

`GET /admin/voucher-products/:id/vouchers` adds `purchased_day` (`YYYY-MM-DD`, the batch's purchase day in the plugin's `timezone`, as the batches list gives it since ticket 07) to each Voucher's `batch`, which becomes `{ id, reference, purchased_day }`. The admin page uses it. See the admin spec.

**Blocked by:** none.

**Status:** done (PR #49)

- [x] Each Voucher's `batch` in `GET /admin/voucher-products/:id/vouchers` has `purchased_day` in the plugin's time zone (HTTP integration test, written first)
- [x] The Batch column shows the reference, or the purchase day when the batch has none, matching the batch filter's label
- [x] The admin spec's description of the Vouchers route mentions `purchased_day`
- [x] Checked on a real screen in the dev app with screenshots (rule 13)
