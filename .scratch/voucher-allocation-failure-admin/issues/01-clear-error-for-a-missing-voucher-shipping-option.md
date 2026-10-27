# 01: Clear error for a missing Voucher shipping option

**What to build:** when the plugin records the fulfillment of an order's Voucher lines and the shipping option to use cannot be found, the error logged names the id that was not found and where it came from (`delivery.fulfillment.shippingOptionId` or the order's own shipping method), instead of Medusa's `Cannot read properties of undefined (reading 'shipping_profile_id')`. The retry job keeps trying as before. See `.scratch/voucher-allocation-failure-admin/spec.md` (user story 19, Q7).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] With `delivery.fulfillment.shippingOptionId` set to an id that does not exist, the logged error names that id and the option (HTTP test in `voucher-fulfillment.spec.ts`)
- [ ] Without the option and with an order whose shipping method's option no longer exists, the logged error names that id and says it is the order's shipping method (HTTP test)
- [ ] The Delivery stays `delivered`, no fulfillment is made, and the retry job records it once the setting is fixed (existing behaviour, still passing)
- [ ] README's fulfillment section mentions the message
- [ ] Checked on the dev host: a wrong id in `.env` gives the new message in the backend log (rule 13)
