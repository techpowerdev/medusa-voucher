# 05: Mark a variant as a Voucher product from its page

**What to build:** a widget on the product variant page. For a variant that is not a Voucher product it marks it (Face value, currency defaulting to the store's default currency) through `POST /admin/voucher-products`. For one that is, it shows the Face value, the Available count and a link to the Voucher product's page, and allows changing the Face value or currency only while there are no Vouchers. English and Thai. See "Variant widget" in the admin spec.

**Blocked by:** 01 (Count a Voucher product's Pool by status); its link targets the page of ticket 03.

**Status:** done (PR #29)

- [x] A variant can be marked with a Face value and currency; the store's default currency is preselected
- [x] A marked variant shows its Face value, Available count and a link to its Voucher product page
- [x] Editing is offered only while the Voucher product has no Vouchers; the API's refusal is shown otherwise
- [x] English and Thai labels
- [x] Checked on a real screen in the dev app with screenshots (rule 13)
