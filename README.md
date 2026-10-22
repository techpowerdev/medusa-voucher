# @khumkha/medusa-voucher

A [Medusa](https://medusajs.com) v2 plugin for reselling vouchers issued by third-party partners (supermarkets, coffee chains and similar). You buy voucher codes from a partner in advance, import them, sell them to customers as ordinary Medusa products, and deliver one code per purchased unit by email.

> **Status: early development.** The data model, encrypted storage, CSV import API, Voucher products, automatic allocation of paid orders and retrying or resolving Allocation failures exist; sending vouchers to customers and the admin pages do not yet. The design is described in [`GLOSSARY.md`](./GLOSSARY.md) and [`docs/adr/`](./docs/adr).

## Planned features

- Admin page to import voucher codes from a CSV file (the import API already exists, see below).
- Link each face value to a Medusa product variant, and track the codes available for sale.
- Allocate codes to an order after payment and deliver them to the customer through the Notification module (email first, LINE later) as text and as a QR code.
- Admin pages to import, review and replace codes, with stock and expiry alerts.
- Store API for signed-in customers to view the codes they bought, with the QR code.
- Codes are encrypted at rest; an encryption key is required in the plugin options.

This is not a gift card, store credit or discount code plugin: Medusa already provides those through its Loyalty plugin and Promotion module.

## Compatibility

Requires `@medusajs/medusa` >= 2.21.2 and Node `^20.19.0 || >=22.12.0` (`.nvmrc` pins 22.23.3). Development uses [pnpm](https://pnpm.io).

## Installation

```bash
npm install @khumkha/medusa-voucher
# or: yarn add / pnpm add @khumkha/medusa-voucher
```

Register it in `medusa-config.ts`:

```ts
import { defineConfig } from "@medusajs/framework/utils"

module.exports = defineConfig({
  // ...
  plugins: [
    {
      resolve: "@khumkha/medusa-voucher",
      options: {
        encryptionKey: process.env.VOUCHER_ENCRYPTION_KEY,
        timezone: "Asia/Bangkok", // optional; the default
        minimumRemainingValidityDays: 0, // optional; the default (no minimum)
      },
    },
  ],
})
```

`encryptionKey` is required (at least 32 characters, using at least 10 different characters, so a value such as `aaaa…` is rejected) and the application will not start without it. `medusa db:migrate` also loads the plugin: with the option missing, the migrations are applied but the command then exits with an error, so set `VOUCHER_ENCRYPTION_KEY` in every environment that runs migrations, including deploy scripts. Voucher codes and PINs are stored encrypted with keys derived from it. Generate one with `openssl rand -base64 32`, keep it in your secret store, and do not change or lose it: stored codes cannot be read without the key that encrypted them, and key rotation is not supported yet.

Then run the migrations in your Medusa app:

```bash
npx medusa db:migrate
```

## Voucher products

A variant delivers Vouchers only when you mark it as a Voucher product (see [ADR-0003](./docs/adr/0003-mark-voucher-products-with-a-linked-model.md)). Sell one Medusa product per partner (for example a supermarket) with a variant per face value, then mark each variant (admin authentication):

- `POST /admin/voucher-products` with `variant_id`, `face_value` and `currency_code` marks a variant. An unknown variant is refused (404) and so is one that is already marked (422).
- `GET /admin/voucher-products` lists them with the variant and `available_vouchers`.
- `POST /admin/voucher-products/:id` changes `face_value` or `currency_code`, only while the Voucher product has no Vouchers.

The link between a Voucher product and its variant is a Medusa module link, so run `npx medusa db:migrate` in the host application to create its table.

## Allocating vouchers

`allocateVouchersToOrderWorkflow` (exported from `@khumkha/medusa-voucher/workflows`) takes an `order_id` and gives one Available Voucher to each purchased unit of the order's Voucher product lines, all or none for the order. Other lines are ignored. If a Voucher product does not have enough Vouchers, nothing is allocated for the order and an Allocation failure is recorded for each short line. It never decrypts a code and its result contains none.

- A Voucher qualifies when it is Available, not expired, and has at least `minimumRemainingValidityDays` whole days of validity left, counted from the later of now and its `valid_from` instant. The default is 0 (no minimum); expired Vouchers are never allocated.
- The Vouchers that end soonest go first; those that never expire go last.
- It is safe when several orders are allocated at the same moment (no Voucher goes to two orders) and when it runs again for the same order: an order that already has its Vouchers keeps them, and a line that is still short keeps one open Allocation failure.

Allocation starts on its own once an order is a Paid order: Medusa's payment status for the order is `captured`, or the order has a total of 0 and no payment collection (a cart with a total of 0 is completed without payment). The plugin's subscribers on `payment.captured` and `order.placed` run `allocateVouchersForPaidOrderWorkflow`, which checks this and then runs the allocation; a canceled, authorized, partly captured or refunded order is left alone. `order.placed` covers payment providers that capture when authorizing (such as Stripe with `capture: true`), which emit no `payment.captured`.

A scheduled job, `recover-unallocated-paid-orders`, runs every 15 minutes and catches Paid orders whose subscriber failed (Medusa's event bus does not retry a subscriber by default) or whose event never arrived: orders created between 7 days and 10 minutes ago with a Voucher product line and neither an Allocation nor an Allocation failure. It logs each order it recovers as a warning and each one it could not as an error, then tries those again on its next run. Medusa runs scheduled jobs only on a server whose `workerMode` is `worker` or `shared`, so keep at least one such instance; the workflow behind it, `recoverUnallocatedPaidOrdersWorkflow`, is exported too.

### Allocation failures

When a Voucher product's Pool cannot cover a Paid order, nothing is allocated and an open Allocation failure is recorded for each short line. After importing more Vouchers, an operator retries them (admin authentication):

- `GET /admin/allocation-failures` lists failures, open by default (`status=resolved` for the others), oldest first, optionally for one `voucher_product_id`, with `limit` and `offset`. Each shows the order, its line item, the Voucher product, the units requested and the units available when it was recorded.
- `POST /admin/voucher-products/:id/retry-allocation-failures` tries each order waiting on that Voucher product once, oldest first, with the same all-or-none rule and the Paid order check as a new order, and returns `{ allocated, still_open, failed }` (order ids). An order also short on another Voucher product, or refunded or canceled while it waited, stays open. An order whose allocation throws is logged as an error and listed in `failed`; the others are still tried.
- `POST /admin/allocation-failures/:id/resolve` with a `note` closes one failure settled another way (a refund, for example) and records the admin and the time. A failure already resolved is refused (422); an unknown one is 404.

An order that gets its Vouchers by any route (a retry, a subscriber or the recovery job) has its open failures resolved automatically, with `resolved_by` set to `system`.

Known gaps: an order captured more than 7 days after it was placed, whose subscriber also failed, is not recovered; orders paid before the plugin was installed, and Voucher lines added to an order after it was allocated, are not allocated.

## Importing vouchers

`POST /admin/voucher-batches/import` (admin authentication) creates a Voucher batch and stores the vouchers in a CSV file for it. The body is JSON: `voucher_product_id` (an existing Voucher product, see above; an unknown one is refused with 404), `purchased_at`, optional `unit_cost`, `reference` and `redemption_instructions`, and `csv` (the file's text). The batch stores only these per-purchase details: the Face value and currency are the Voucher product's, and the Partner is not stored because the Medusa product already says whose voucher it is. The response is the batch and the number imported (`imported`), never the codes.

The CSV needs a header row. `code` is required; `pin`, `valid_from` and `valid_until` are optional; other columns are rejected.

```csv
code,pin,valid_from,valid_until
AAAA-1111-2222,,2026-01-01,31-12-2026
BBBB-3333-4444,1234,,
```

`valid_from` and `valid_until` are dates only, as `YYYY-MM-DD` or `DD-MM-YYYY`, and each counts as the whole of that day in the plugin's `timezone` option (an IANA zone, `Asia/Bangkok` by default): a voucher is valid from 00:00 on its `valid_from` date through the end of its `valid_until` date. A time, a two-digit year or a date that does not exist is rejected. Internally the period is stored as instants, `valid_from <= now < valid_until`, like Medusa's own campaigns, with `valid_until` set to 00:00 of the day after the date given. A file is imported whole or not at all: any problem (a bad date, an empty code, a code repeated in the file or already stored) rejects it with the line numbers concerned, and never the codes themselves. A file may hold up to 50,000 vouchers.

## Development

This repository uses pnpm (see `AGENTS.md` for all commands).

```bash
pnpm install
pnpm medusa plugin:publish        # publish to the local registry
# in your Medusa app:
pnpm medusa plugin:add @khumkha/medusa-voucher
# back in this project, watch for changes:
pnpm dev
```

Tests need PostgreSQL: `docker compose up -d`, copy `.env.template` to `.env` and `.env.test.template` to `.env.test`, then:

```bash
pnpm test:unit
pnpm test:integration:modules
pnpm test:integration:http   # builds first; needs migrations (pnpm db:generate)
pnpm db:generate   # generate migrations after changing a data model
```

Build for production with `pnpm build`, then `pnpm publish`.

## License

MIT
