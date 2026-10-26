# 01: Voucher product linked to a variant

**What to build:** An operator can mark an existing product variant as a Voucher product by giving it a Face value and currency, see the Voucher products with how many Vouchers each has Available, and change a Voucher product's Face value and currency while it has no Vouchers. The marker is a plugin-owned record linked to the variant through a Medusa module link (ADR-0003). This slice first proves that such a link works end to end in a host application; if it cannot, stop and revise ADR-0003 with the fallback before building more.

**Blocked by:** None (can start immediately).

**Status:** done (feature/voucher-product, pending review)

- [x] A Voucher product can be created for an existing variant with a Face value and currency, through an authenticated admin API
- [x] Creating one for an unknown variant, or for a variant that is already a Voucher product, is refused with a clear error
- [x] The admin API lists Voucher products with the variant they are linked to and the number of Available Vouchers (zero for a new one)
- [x] A Voucher product's Face value and currency can be changed while it has no Vouchers and are refused afterwards
- [x] The linked variant can be read from a Voucher product (and the reverse) through Medusa's query, proven by an integration test in a host application using the built plugin
- [x] No response contains a Voucher code, PIN or hash
- [x] The migration is generated and committed; running it again produces nothing new
- [x] Glossary, spec and ADR still match what was built; README notes that a host application must run `medusa db:migrate` for the link table
