# @khumkha/medusa-voucher

A [Medusa](https://medusajs.com) v2 plugin for reselling vouchers issued by third-party partners (supermarkets, coffee chains and similar). You buy voucher codes from a partner in advance, import them, sell them to customers as ordinary Medusa products, and deliver one code per purchased unit by email.

> **Status: early development.** Only a placeholder `voucher` module exists so far. The design is described in [`GLOSSARY.md`](./GLOSSARY.md) and [`docs/adr/`](./docs/adr).

## Planned features

- Import voucher codes from a CSV file as a batch, with the partner, face value, cost, validity period and redemption instructions.
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
