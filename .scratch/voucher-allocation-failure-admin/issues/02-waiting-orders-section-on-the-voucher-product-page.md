# 02: Waiting orders section on the Voucher product page

**What to build:** the Voucher product page shows a section "Allocation failures" ("คำสั่งซื้อที่รอ Voucher") after the Pool, with a waiting/settled filter. Waiting rows show the order's display number linking to the order, the customer's email, the units requested and available when it failed, and the date, oldest first. Settled rows show when, by whom (an admin or `system`) and the note. The Allocation failure list API gains `display_id` and `email` per failure. Read only; the actions come in ticket 03. See `.scratch/voucher-allocation-failure-admin/spec.md` (user stories 1–5, 20; Q1, Q6, Q10, Q13).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `GET /admin/voucher-allocation-failures` returns each failure's order `display_id` and `email`, and still no secret (HTTP test in `allocation-failures-admin.spec.ts`)
- [ ] The section is built with the dashboard's `DataTable`, hooks and translations (rule 14), with its filter and pages kept in the URL
- [ ] English and Thai labels follow the spec's words; never "out of stock" or "failed order"
- [ ] README's Allocation failures section mentions the admin section and the new fields
- [ ] Checked on the dev host with screenshots: an order bought while the Pool is empty appears as waiting; a resolved one appears under settled (rule 13)
