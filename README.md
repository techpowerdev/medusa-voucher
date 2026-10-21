# @khumkha/medusa-voucher

A [Medusa](https://medusajs.com) v2 plugin for creating, managing and redeeming vouchers.

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
      options: {},
    },
  ],
})
```

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
