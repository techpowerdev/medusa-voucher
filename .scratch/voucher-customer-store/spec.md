# Spec: Customers view the Vouchers they bought

**Status:** ready-for-agent

## Problem Statement

A customer gets their Vouchers only by email. If the email is late, lost or deleted, they cannot see the codes they paid for, and the shop has no API to show them on a "My vouchers" page.

## Solution

Two store API routes for a signed-in customer: a list of the Vouchers of their own orders with each code masked, and one Voucher in full (code, PIN and QR code). The plugin provides the API; the shop builds the page in its storefront.

## User Stories

1. As a signed-in customer, I want to list the Vouchers of my orders, so that I can find a code without searching my email.
2. As a signed-in customer, I want each listed Voucher to show its product, Face value, first and last usable day and Redemption instructions, so that I know what it is and until when I can use it.
3. As a signed-in customer, I want the list to mask each code, so that a screenshot or log of the list does not leak codes.
4. As a signed-in customer, I want to open one Voucher and get its full code, its PIN and its QR code, so that I can redeem it at the Partner.
5. As a signed-in customer, I want to see a Voucher as soon as it is Allocated to my Paid order, even if its email has not arrived, so that a failed Delivery does not keep me from my code.
6. As a signed-in customer, I want to filter the list by order and page through it, so that a long history stays usable.
7. As a customer, I want nobody else to see my Vouchers, so that my codes stay mine; asking for another customer's Voucher looks the same as asking for one that does not exist.
8. As a shop, I want the QR code generated the same way as in the email, so that the code and the QR always match.
9. As a shop, I want viewing a Voucher to change nothing (no Delivery, no status change), so that Delivery and fulfillment stay as they are.

## Implementation Decisions

- Routes (decided with the user, Q5): `GET /store/customers/me/vouchers` and `GET /store/customers/me/vouchers/:id`. Medusa already requires a signed-in customer (session or bearer) on `/store/customers/me*`. AGENTS.md rule 17 gains an exception for customer-owned routes under `/store/customers/me/voucher...`, and the host-names guard test accepts exactly that.
- Ownership: a Voucher belongs to a customer when its Allocation's order belongs to that customer (the Allocation already records the order's `customer_id`; no new field). Guest orders are not shown (Q1).
- Shown: Vouchers whose status is Allocated or Delivered; Void is hidden (Q2). Viewing is not a Delivery and changes nothing; reveals are not recorded in this version (Q6).
- List item: id, status, `code_hint` (masked, as in the admin), the order (`id`, `display_id`), the product and variant titles, Face value and currency, `first_day` and `last_day` in the plugin's `timezone` (null when open), Redemption instructions. Newest order first; filter `order_id`; `limit` (20 by default) and `offset`; `count`.
- One Voucher: the list item plus `code`, `pin` (null when none) and `qr_code`, a PNG data URL of the code alone, generated on each request with the `qrcode` package the email uses and never stored (Q3, Q4). Decrypting goes through `revealVoucher` only.
- Another customer's Voucher, a Void one, or an unknown id: 404.
- No storefront page in this plugin (Q7); README documents both routes with an example.

## Testing Decisions

- Test through the HTTP routes against a real database, signed in as a customer (prior art: `integration-tests/http/voucher-pool-lists.spec.ts` for lists, `voucher-fulfillment.spec.ts` for a publishable key).
- Seams confirmed with the user before the first test (rule 8).
- Screen evidence on the dev host: the two routes as the order's customer, and a 404 as another customer.

## Out of Scope

- A storefront page; recording who revealed a code; guest orders; Replacement.

## Further Notes

Decided with the user on 2026-10-26 (Q1–Q7, Q5 revised to `/store/customers/me`). Not verified: whether Medusa reuses a guest customer record when that shopper later registers with the same email; if it does, their earlier guest orders would show, which Q1 does not forbid outright.
