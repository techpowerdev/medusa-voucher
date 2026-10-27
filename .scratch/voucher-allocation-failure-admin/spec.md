# Spec: Allocation failures in the admin

**Status:** ready-for-agent

## Problem Statement

Since [ADR-0006](../../docs/adr/0006-sell-beyond-the-pool-and-settle-allocation-failures-afterwards.md) a store keeps selling a Voucher product whose Pool is empty, so Allocation failures are the normal way a sale beyond the Pool shows up. A person must settle each one, by importing more Vouchers and retrying or by refunding the order, but the admin shows none of it: the failures, the retry and the resolve exist only as admin API routes. Staff cannot see which orders wait for Vouchers, a customer asking about a missing code gets no answer from the order page, and after importing a batch someone has to remember to call the retry route.

Separately, when the shipping option the plugin fulfills Voucher lines with does not exist (a wrong `delivery.fulfillment.shippingOptionId`, for example after the host's database was reseeded), the error logged is Medusa's `Cannot read properties of undefined (reading 'shipping_profile_id')`, which does not say what is wrong.

## Solution

- The Voucher product page gets a section listing the orders waiting for its Vouchers (open Allocation failures) and those already settled, with a button to retry the waiting orders and a button per order to resolve it with a note.
- The Vouchers list page shows, per Voucher product, how many orders wait for Vouchers.
- Medusa's order page shows, for an order waiting for Vouchers, which Voucher products it is short of and links to them.
- Importing a Voucher batch retries the waiting orders of that Voucher product at once, from the admin and from the API, and reports what happened.
- A fulfillment whose shipping option cannot be found logs which id was not found and where it came from.

## User Stories

1. As a store operator, I want to see on a Voucher product's page the orders waiting for its Vouchers, so that I know who has paid and has not received codes.
2. As a store operator, I want each waiting order to show its display number linking to the order, the customer's email, the units requested and the units available when it failed, and when it failed, so that I can contact the customer and know how many codes to buy.
3. As a store operator, I want the waiting orders oldest first, so that the customers who waited longest are served first.
4. As a store operator, I want to switch the section between waiting and settled orders, so that I can look back at how each one was settled.
5. As a store operator, I want each settled order to show when it was settled, by whom (a person or the system) and the note, so that I can tell a refunded order from one that got its Vouchers.
6. As a store operator, I want a button that retries the waiting orders of this Voucher product, so that I can serve them after the Pool has grown without calling the API.
7. As a store operator, I want the retry to tell me how many orders got their Vouchers, how many still wait and how many could not be tried, so that I know whether I need to act further.
8. As a store operator, I want to resolve a waiting order with a required note, so that an order I refunded or settled another way stops waiting.
9. As a store operator, I want resolving to ask for confirmation and remind me that it does not refund the customer, so that I do not close an order believing it is refunded.
10. As a store operator, I want a resolved order to stay resolved, so that its record cannot be changed after the fact.
11. As a store operator, I want the Vouchers list page to show how many orders wait for each Voucher product, so that I see at a glance which Pools need codes.
12. As a store operator, I want an order's page to tell me when the order is waiting for Vouchers, so that I can answer a customer who asks where their code is.
13. As a store operator, I want that notice to name each Voucher product the order is short of, with the units, and link to its page, so that I can go where the order can be settled.
14. As a store operator, I want importing a Voucher batch to serve the waiting orders of that Voucher product at once, so that I do not have to remember a second step.
15. As a store operator, I want the import dialog to tell me how many waiting orders the import served, so that I know the customers got their codes.
16. As an integrator importing through the API, I want the import response to include the retry result, so that my own tooling gets the same behaviour as the admin.
17. As a store operator, I want an import to keep its Vouchers even if serving the waiting orders fails, so that I never have to import the same codes twice; I can retry from the Voucher product page.
18. As a store operator, I want an order refunded or canceled while it waited to stay waiting after a retry, so that I never send codes for an order I no longer charge.
19. As a developer running the host, I want a fulfillment whose shipping option is missing to log the id that was not found and whether it came from `delivery.fulfillment.shippingOptionId` or from the order's own shipping method, so that I can fix the setting.
20. As a store operator reading the admin in Thai, I want the section called "คำสั่งซื้อที่รอ Voucher" and the column "รอ Voucher", so that the words say what I must do and do not suggest the order is broken.

## Implementation Decisions

Decided with the user on 2026-10-27 (Q1–Q15).

- **Allocation failure list API** gains, per failure, the order's `display_id` and `email` (Q10) and an `order_id` filter for the order page (Q2, Q14). Nothing secret is added; failures carry no Voucher.
- **Voucher product APIs** (list and one) gain the number of orders with an open Allocation failure for that Voucher product (Q3, Q11). It counts orders, not units, and is worked out when read, like `counts`.
- **Import**: the import workflow, after storing the batch, runs the existing retry of that Voucher product's open Allocation failures (same all-or-none rule and Paid order check) and returns its result `{ allocated, still_open, failed }` beside the batch and `imported` (Q4, Q8). If the retry step throws as a whole, the import is kept and the response says the retry did not run (Q9); errors for single orders are already reported in `failed` by the existing retry. The retry reuses the existing workflow; no new allocation logic. A step that throws makes Medusa compensate the earlier steps and would remove the stored batch, so the retry catches its own error and reports that it did not run instead of failing the import.
- **Voucher product page** (admin): a section after the Pool with a waiting/settled filter, built with the dashboard's `DataTable` and hooks (AGENTS.md rule 14). Waiting rows: display number linking to the order, email, "requested N, available M", date; oldest first. Settled rows: resolved date, by whom (an admin or `system`), note (Q1, Q5, Q6, Q10). A "retry" action for the whole Voucher product shows the counts afterwards (Q4, user story 7). A "resolve" action per waiting row asks for a required note in a confirmation that states it does not refund (Q5). No reopening (Q12).
- **Vouchers list page**: a column with the number of waiting orders (Q3, Q11).
- **Order page**: a widget on Medusa's order details page, shown only when the order has an open Allocation failure, listing each Voucher product it is short of with the units and a link to the Voucher product page; no actions (Q2, Q14).
- **Import dialog**: after a successful import, it also states how many waiting orders were served, or that the retry did not run (Q4, Q9).
- **Words** (Q13): English uses the glossary term "Allocation failures"; Thai uses "คำสั่งซื้อที่รอ Voucher" for the section and "รอ Voucher" for the column. Never "out of stock" or "failed order" (GLOSSARY.md). Both languages through the plugin's i18n.
- **Missing shipping option** (Q7): when recording the fulfillment of Voucher lines, if the shipping option to use cannot be found, fail with a message naming the id and its source (`delivery.fulfillment.shippingOptionId` or the order's shipping method) before calling Medusa's fulfillment workflow. It is still logged as an error and retried by the existing job; nothing is checked at startup.
- No data model change, no migration, no new event. GLOSSARY.md and ADRs unchanged.

## Testing Decisions

- Test external behaviour through HTTP routes against a real Medusa app and database; never assert on internals (seams confirmed with the user, Q15):
  1. `GET /admin/voucher-allocation-failures`: `display_id` and `email` per failure, and the `order_id` filter (prior art: `integration-tests/http/allocation-failures-admin.spec.ts`).
  2. Voucher product list and one: the number of waiting orders (prior art: `voucher-pool-counts.spec.ts`).
  3. `POST /admin/voucher-batches/import`: waiting orders are allocated and the retry result is returned; when the retry throws as a whole (forced with `jest.spyOn`), the Vouchers are still imported and the response says the retry did not run (prior art: `allocation-retry.spec.ts`).
  4. Fulfillment with a missing shipping option: the logged error names the id and its source (prior art: `voucher-fulfillment.spec.ts`, which mocks `getDeliverySettings` and spies on the logger).
- Admin screens have no automated tests, as before; logic that can be pulled out of a component (for example wording the retry result) gets a unit test like `src/admin/lib/__tests__`.
- Screen check on the dev host with screenshots in each PR (AGENTS.md rule 13): an order sold beyond the Pool appears on the Voucher product page, the list page and the order page; importing a batch serves it; resolving another one with a note; the settled filter.

## Out of Scope

- Telling staff when an Allocation failure happens (email or notification): part of the Low stock / Expiring soon alerts work.
- Reopening a resolved Allocation failure.
- A separate admin page listing every Allocation failure across Voucher products.
- Refunding from the plugin: refunds stay in Medusa's order page.
- Checking `shippingOptionId` at startup.

## Further Notes

- The host data from the 2026-10-27 tests (orders #1–#5 of `malee.mixed@example.test`) has no open Allocation failure left; the screen check needs a new order bought while the Pool is empty.
