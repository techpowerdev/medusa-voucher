# @khumkha/medusa-voucher

A [Medusa](https://medusajs.com) v2 plugin for reselling vouchers issued by third-party partners (supermarkets, coffee chains and similar). You buy voucher codes from a partner in advance, import them, sell them to customers as ordinary Medusa products, and deliver one code per purchased unit by email.

> **Status: early development.** The data model, encrypted storage and CSV import API exist; allocation, delivery and the admin pages do not yet. The design is described in [`GLOSSARY.md`](./GLOSSARY.md) and [`docs/adr/`](./docs/adr).

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

## Importing vouchers

`POST /admin/voucher-batches/import` (admin authentication) creates a Voucher batch and stores the vouchers in a CSV file for it. The body is JSON: `partner`, `variant_id` (an existing product variant), `face_value`, `currency_code`, `purchased_at`, optional `unit_cost`, `reference` and `redemption_instructions`, and `csv` (the file's text). The response is the batch and the number imported (`imported`), never the codes.

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
