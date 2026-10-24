# 07: Show a batch's purchase date in the plugin's time zone

**What to build:** `GET /admin/voucher-products/:id/batches` adds `purchased_day` to each batch: the calendar day of `purchased_at` in the plugin's `timezone` option, as `first_day` and `last_day` are for Vouchers. The Voucher product page shows that day instead of turning `purchased_at` into the viewer's own day, and the batch filter's labels use it too. The import dialog sends the chosen purchase date as that day in the plugin's time zone (the start of the day there), so a batch bought on a day shows that day wherever the admin is opened. Batches already stored keep their `purchased_at`.

**Blocked by:** none (follows 03 and 04).

**Status:** ready-for-agent

- [ ] Each batch in the batches list has `purchased_day` in the plugin's time zone, tested through the admin route against a real database, including an instant near midnight that falls on a different day in UTC
- [ ] The Voucher product page and the batch filter show `purchased_day`
- [ ] The import dialog stores the chosen day as that day's start in the plugin's time zone
- [ ] Checked on a real screen in the dev app with screenshots (rule 13)
