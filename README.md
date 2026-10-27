# @khumkha/medusa-voucher

A [Medusa](https://medusajs.com) v2 plugin for reselling vouchers issued by third-party partners (supermarkets, coffee chains and similar). You buy voucher codes from a partner in advance, import them, sell them to customers as ordinary Medusa products, and deliver one code per purchased unit by email.

> **Status: early development.** The data model, encrypted storage, CSV import API, Voucher products, automatic allocation of paid orders and retrying or resolving Allocation failures and emailing an order's Vouchers once they are allocated, with retries, and recording Medusa's fulfillment of the delivered Voucher lines exist, with admin pages to mark Voucher products, review the Pool and import a CSV, and a store API for signed-in customers to view the Vouchers they bought. The design is described in [`GLOSSARY.md`](./GLOSSARY.md) and [`docs/adr/`](./docs/adr).

## Planned features

- Low stock and expiring-soon alerts.
- Replacing a Delivered Voucher that did not work.
- Delivery through LINE.

This is not a gift card, store credit or discount code plugin: Medusa already provides those through its Loyalty plugin and Promotion module.

## Compatibility

Requires `@medusajs/medusa` >= 2.21.2 and Node `^20.19.0 || >=22.12.0` (`.nvmrc` pins 22.23.3). Development uses [pnpm](https://pnpm.io).

## Installation

The plugin is not published to npm yet. Each [GitHub Release](https://github.com/techpowerdev/medusa-voucher/releases) carries the built package as a `.tgz` file; install it by its URL (replace both version numbers with the release you want):

```bash
npm install https://github.com/techpowerdev/medusa-voucher/releases/download/v0.3.1/khumkha-medusa-voucher-0.3.1.tgz
# or: yarn add / pnpm add with the same URL
```

Installing from the repository itself (`github:techpowerdev/medusa-voucher`) does not work: the built code in `.medusa/server` is not committed, so the package would have no code.

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
- `GET /admin/voucher-products` lists them by Partner (the Medusa product's title), then variant, with the variant and its product (`id`, `title`), `available_vouchers` and `counts` (`limit` and `offset`, 50 by default).
- `GET /admin/voucher-products/:id` returns one with its variant, the Medusa product and `counts`; an unknown id is refused (404).
- `GET /admin/voucher-products/:id/batches` lists its Voucher batches, newest purchase first, each with `purchased_at`, `purchased_day` (its day in the plugin's `timezone`, as `YYYY-MM-DD`), `unit_cost`, `reference`, `redemption_instructions` and its own `counts` (`limit` and `offset`, 20 by default).
- `GET /admin/voucher-products/:id/vouchers` lists its Vouchers, soonest to expire first and open-ended last, each with `status` (one of the `counts` names), `code_hint` (the code's last characters, never the code), `batch`, `first_day` and `last_day` (whole days in the plugin's `timezone`, null when open) and the `order` (`id`, `display_id`) it was allocated to. Filter with `status` and `batch_id`; `limit` and `offset`, 20 by default.
- `POST /admin/voucher-products/:id` changes `face_value` or `currency_code`, only while the Voucher product has no Vouchers.

`counts` is the Pool by what can be done with it: `available` (Vouchers that can still be sold: within their validity and with at least `minimumRemainingValidityDays` left, the same rule allocation uses), `expired` (past their validity), `under_minimum` (still valid but with too little left to be sold), `allocated`, `delivered` and `void`. `available_vouchers` equals `counts.available`; before this it also counted expired and under-minimum Vouchers. The counts are worked out when read, so they are right at any moment; under-minimum is never stored, since it depends on an option you can change.

A scheduled job, `mark-expired-vouchers`, runs every 15 minutes and records as `expired` the Available Vouchers whose validity has ended, logging how many as info. Allocated, Delivered and Void Vouchers keep their status. It needs a server whose `workerMode` is `worker` or `shared`, like the other jobs; the workflow behind it, `markExpiredVouchersWorkflow`, is exported too.

In the admin, **Vouchers** in the sidebar lists the Voucher products with their counts, and each one has a page with its counts, Voucher batches and Vouchers, filtered by status or batch, with only the masked `code_hint` of each code. **Import CSV** on that page opens a dialog for a new Voucher batch: purchase date (today by default), unit cost, reference and Redemption instructions (starting as the latest batch's), and a CSV file read in the browser, of which only the name and row count are shown. It posts to the import API below and shows how many Vouchers were imported, or each problem with its line number. A **Voucher product** box on each product variant's page marks the variant as a Voucher product (Face value, and currency starting as the store's default), or shows its Face value, Available count and a link to its page, with an edit action while it has no Vouchers. The pages are in English and Thai.

The link between a Voucher product and its variant is a Medusa module link, so run `npx medusa db:migrate` in the host application to create its table.

## Allocating vouchers

`allocateVouchersToOrderWorkflow` (exported from `@khumkha/medusa-voucher/workflows`) takes an `order_id` and gives one Available Voucher to each purchased unit of the order's Voucher product lines, all or none for the order. Other lines are ignored. If a Voucher product does not have enough Vouchers, nothing is allocated for the order and an Allocation failure is recorded for each short line. It never decrypts a code and its result contains none.

- A Voucher qualifies when it is Available, not expired, and has at least `minimumRemainingValidityDays` whole days of validity left, counted from the later of now and its `valid_from` instant. The default is 0 (no minimum); expired Vouchers are never allocated.
- The Vouchers that end soonest go first; those that never expire go last.
- It is safe when several orders are allocated at the same moment (no Voucher goes to two orders) and when it runs again for the same order: an order that already has its Vouchers keeps them, and a line that is still short keeps one open Allocation failure.

Allocation starts on its own once an order is a Paid order: Medusa's payment status for the order is `captured`, or the order has a total of 0 and no payment collection (a cart with a total of 0 is completed without payment). The plugin's subscribers on `payment.captured` and `order.placed` run `allocateVouchersForPaidOrderWorkflow`, which checks this and then runs the allocation; a canceled, authorized, partly captured or refunded order is left alone. `order.placed` covers payment providers that capture when authorizing (such as Stripe with `capture: true`), which emit no `payment.captured`.

A scheduled job, `recover-unallocated-voucher-orders`, runs every 15 minutes and catches Paid orders whose subscriber failed (Medusa's event bus does not retry a subscriber by default) or whose event never arrived: orders created between 7 days and 10 minutes ago with a Voucher product line and neither an Allocation nor an Allocation failure. It logs each order it recovers as a warning and each one it could not as an error, then tries those again on its next run. Medusa runs scheduled jobs only on a server whose `workerMode` is `worker` or `shared`, so keep at least one such instance; the workflow behind it, `recoverUnallocatedPaidOrdersWorkflow`, is exported too.

### Allocation failures

When a Voucher product's Pool cannot cover a Paid order, nothing is allocated and an open Allocation failure is recorded for each short line. The store keeps selling a Voucher product whose Pool is empty, so this is how a sale beyond the Pool is settled: by importing more Vouchers and retrying, or by refunding the order and resolving the failure ([ADR-0006](./docs/adr/0006-sell-beyond-the-pool-and-settle-allocation-failures-afterwards.md)). After importing more Vouchers, an operator retries them (admin authentication):

- `GET /admin/voucher-allocation-failures` lists failures, open by default (`status=resolved` for the others), oldest first, optionally for one `voucher_product_id`, with `limit` and `offset`. Each shows the order, its line item, the Voucher product, the units requested and the units available when it was recorded.
- `POST /admin/voucher-products/:id/retry-allocation-failures` tries each order waiting on that Voucher product once, oldest first, with the same all-or-none rule and the Paid order check as a new order, and returns `{ allocated, still_open, failed }` (order ids). An order also short on another Voucher product, or refunded or canceled while it waited, stays open. An order whose allocation throws is logged as an error and listed in `failed`; the others are still tried.
- `POST /admin/voucher-allocation-failures/:id/resolve` with a `note` closes one failure settled another way (a refund, for example) and records the admin and the time. A failure already resolved is refused (422); an unknown one is 404.

An order that gets its Vouchers by any route (a retry, a subscriber or the recovery job) has its open failures resolved automatically, with `resolved_by` set to `system`.

Known gaps: an order captured more than 7 days after it was placed, whose subscriber also failed, is not recovered; orders paid before the plugin was installed, and Voucher lines added to an order after it was allocated, are not allocated.

## Delivering vouchers

Once an allocation gives an order its Vouchers, the plugin emails them to the customer in one message, recorded as the order's Delivery on the `email` channel. The allocation emits `voucher.allocated` with `{ order_id }` after it has committed (a repeated allocation that finds the order already served emits nothing), and the plugin's subscriber to that event runs `deliverOrderVouchersWorkflow` (exported from `@khumkha/medusa-voucher/workflows`), so a slow or failing email provider never holds up or undoes an allocation. Set the plugin option `delivery.automatic` to `false` to send nothing on its own, for example before your email provider is set up; you then call the workflow with an `order_id` yourself, and the retry job below sends nothing either.

```ts
options: {
  encryptionKey: process.env.VOUCHER_ENCRYPTION_KEY,
  delivery: { automatic: false }, // optional; true by default
},
```

A scheduled job, `retry-voucher-deliveries`, runs every 15 minutes. It tries again the email Deliveries created in the last 7 days that failed fewer than 5 times, and those still sending after 10 minutes (a process that died mid-send), which it first marks failed with `Sending was interrupted`. It also sends the orders allocated between 7 days and 10 minutes ago that have no email Delivery, because the subscriber failed or the event never arrived. Only Paid orders are sent, on every try. A Delivery that reached 5 attempts stays failed for an operator. The job logs each order it sends this way as a warning, each retry as info, and each order it could not try as an error, which it tries again on its next run. Like the allocation recovery job, it needs a server whose `workerMode` is `worker` or `shared`; the workflow behind it, `retryVoucherDeliveriesWorkflow`, is exported too.

- Each Voucher shows its code as text and as a QR code (the code alone, never the PIN), the PIN when there is one, the Partner (the Medusa product's title), the Face value, the first and last day it can be used in the plugin's `timezone`, and the Voucher batch's Redemption instructions. The subject and heading carry the order's display number.
- It sends only for a Paid order that is not canceled, the same rule allocation uses; an order without Vouchers is left alone. Concurrent runs for one order send one message.
- When the provider accepts the message, the Delivery becomes `delivered` and the Vouchers `delivered`. When the order has no email, or the provider throws, the Delivery becomes `failed` and the Vouchers stay allocated to the order. The error stored on the Delivery is Medusa's own message; the provider's full message goes to the error log with the order's codes and PINs removed.
- Codes go only into the email's content and attachments, never into the notification's `data`, which Medusa stores as plain JSON in its `notification` table.

### Fulfillment of delivered Voucher lines

Once an order's email Delivery becomes `delivered`, whatever started it, the plugin records Medusa's fulfillment of the order's Voucher lines for the quantities it delivered and marks it delivered at once ([ADR-0005](./docs/adr/0005-fulfill-voucher-lines-as-delivered-after-a-delivery.md)), so the admin shows the order as delivered instead of awaiting fulfillment. Other lines are left to you; an order mixing them shows as partially delivered. A failed Delivery records no fulfillment. Both steps carry `no_notification`, so your own subscribers on fulfillment or delivery events need not email the customer a second time.

Medusa needs a shipping option and a stock location to record any fulfillment, even of items that do not ship. Create a shipping option for Vouchers (for example "Email delivery", priced 0, on a stock location) and give its id:

```ts
options: {
  encryptionKey: process.env.VOUCHER_ENCRYPTION_KEY,
  delivery: {
    fulfillment: { shippingOptionId: process.env.VOUCHER_SHIPPING_OPTION_ID }, // read on every fulfillment
    fulfill: true, // optional; true by default, false if you fulfill orders your own way
  },
},
```

Without it, the order's own shipping method is used; with neither, the fulfillment fails. At startup the id can only be checked to be a non-empty string, so a wrong id shows up as a failed fulfillment, logged as `Shipping option <id>, set in the "delivery.fulfillment.shippingOptionId" option, was not found` (or `from the shipping method of order <id>` when the order's own method points to a removed option). A fulfillment that fails is logged as an error with the order id and the reason; the Delivery stays `delivered` and the email is never sent again for it. The `retry-voucher-deliveries` job records it later for orders delivered in the last 7 days, and skips an order canceled meanwhile without logging it again.

Recommended Voucher product setup: no shipping profile and inventory management off, as Medusa's [Configure Selling Products](https://docs.medusajs.com/resources/commerce-modules/product/selling-products) guide describes for digital products. Medusa then marks the line as not requiring shipping, so a cart of such products completes without a shipping method, and the fulfillment needs no stock reservation. Such an order has no shipping method to fall back on, so set `shippingOptionId`. A Voucher product that does require shipping still works, using the order's shipping method or your option when their shipping profiles match.

- Inventory management gives the variant an inventory item, whose `requires_shipping` (true by default) then decides instead of the shipping profile. If you turn it on, set that to false as well, or the line requires shipping without a shipping profile. The plugin does not keep that stock in step with the Pool (see below).
- Medusa offers shipping options to any cart with a shipping address, whether or not a line requires shipping. Hide the delivery step in your storefront's checkout when no line has `requires_shipping`, or a customer buying only Vouchers can choose, and pay for, a parcel option. Your Voucher shipping option need not be offered in the store at all.
- With inventory management off, Medusa never shows a Voucher product as sold out: a customer can buy it while its Pool is empty, and the order becomes an Allocation failure to settle afterwards ([ADR-0006](./docs/adr/0006-sell-beyond-the-pool-and-settle-allocation-failures-afterwards.md)).

Medusa refuses to cancel an order with a fulfillment that is not canceled, and refuses to cancel a delivered fulfillment, so once an order's Vouchers are delivered the order can no longer be canceled. Refund it instead (Medusa refunds a payment without a return); the customer already holds the codes.

### Email provider

The plugin ships no email provider: it sends through whatever provider your application configures on the Notification module's `email` channel (Medusa allows one provider per channel, and it serves every email of the store). Medusa's default configuration has only a local provider on the `feed` channel, so without this every Delivery fails. Declaring the Notification module replaces that default, so add the local provider back on `feed` if you use it. A provider must:

- send the notification's `content.subject` and `content.html` (and `content.text` if it supports a plain-text part);
- send `attachments` with their `id` as the content id and `disposition: "inline"`, decoding the base64 `content` (the HTML refers to each QR code as `cid:<id>`; data URIs are not used because Gmail blocks them);
- not log the notification's content or attachments.

[`@perseidesjs/notification-nodemailer`](https://www.npmjs.com/package/@perseidesjs/notification-nodemailer) sends through your own SMTP account and meets these (checked against its 3.2.0 source; it sends the HTML and ignores the plain text when HTML is present). Its repository is archived and it was built against Medusa 2.14, so try it against your Medusa version before launch.

```ts
module.exports = defineConfig({
  // ...
  modules: [
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "@perseidesjs/notification-nodemailer/providers/nodemailer",
            id: "nodemailer",
            options: {
              channels: ["email"],
              from: process.env.SMTP_FROM, // for example "My Store <vouchers@example.com>"
              host: process.env.SMTP_HOST,
              port: Number(process.env.SMTP_PORT), // 465 with secure: true, or 587
              secure: process.env.SMTP_PORT === "465",
              auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            },
          },
          {
            resolve: "@medusajs/medusa/notification-local",
            id: "local",
            options: { name: "Local Notification Provider", channels: ["feed"] },
          },
        ],
      },
    },
  ],
})
```

**Gmail:** every email sent through a Gmail account stays in its Sent folder with the codes in it, and Gmail limits how many recipients an account can send to per day (a few hundred for a personal account). Use a dedicated sending account, not a personal one, with two-step verification turned on and an [app password](https://support.google.com/accounts/answer/185833) as `SMTP_PASS` (`smtp.gmail.com`, port 465).

### Your own email

The default email is in English. To write your own (your language, your branding), give the plugin a renderer. It receives the order (`id`, `display_id`, `email`) and its Vouchers (`code`, `pin`, `partner`, `face_value`, `currency_code`, `first_day`, `last_day`, `redemption_instructions`, `qr_code_cid`) and returns `{ subject, html, text }`, synchronously or as a promise. Refer to each QR code as `<img src="cid:${voucher.qr_code_cid}">` and keep the codes as text, so a blocked image never hides them.

```ts
{
  resolve: "@khumkha/medusa-voucher",
  options: {
    encryptionKey: process.env.VOUCHER_ENCRYPTION_KEY,
    delivery: {
      renderers: {
        email: ({ order, vouchers }) => ({
          subject: `บัตรกำนัลของคุณ คำสั่งซื้อ #${order.display_id}`,
          html: vouchers
            .map((v) => `<p>${v.partner}: <b>${v.code}</b></p><img src="cid:${v.qr_code_cid}">`)
            .join(""),
          text: vouchers.map((v) => `${v.partner}: ${v.code}`).join("\n"),
        }),
      },
    },
  },
}
```

Escape any value you put into the HTML yourself; the default email does.

## Customers viewing their Vouchers

A signed-in customer can see the Vouchers of their own orders (store API; Medusa requires a customer session or bearer token on `/store/customers/me*`, and every `/store` request needs a publishable API key). The plugin provides the API only; build the "My vouchers" page in your storefront.

- `GET /store/customers/me/vouchers` lists the customer's Allocated and Delivered Vouchers (never Void ones), newest first, each with `id`, `status`, `code_hint` (the code's last characters, never the code), `order` (`id`, `display_id`), `product` and `variant` (`title`), `face_value`, `currency_code`, `first_day` and `last_day` (whole days in the plugin's `timezone`, null when open) and `redemption_instructions`. Filter with `order_id`; `limit` and `offset`, 20 by default.
- `GET /store/customers/me/vouchers/:id` returns one of them in full: the same fields plus `code`, `pin` (null when there is none) and `qr_code`, a `data:image/png;base64,...` QR code of the code alone (never the PIN), generated on each request and never stored. Another customer's Voucher, a Void one or an unknown id is 404.

Only orders placed while signed in belong to the customer; guest orders are not shown. Viewing a Voucher is not a Delivery and changes nothing.

```ts
// In a Next.js storefront with the Medusa JS SDK, signed in as the customer.
const { vouchers } = await sdk.client.fetch("/store/customers/me/vouchers")
const { voucher } = await sdk.client.fetch(`/store/customers/me/vouchers/${vouchers[0].id}`)
// <img src={voucher.qr_code} alt={voucher.code} />
```

## Importing vouchers

`POST /admin/voucher-batches/import` (admin authentication) creates a Voucher batch and stores the vouchers in a CSV file for it. The body is JSON: `voucher_product_id` (an existing Voucher product, see above; an unknown one is refused with 404), `purchased_at`, optional `unit_cost`, `reference` and `redemption_instructions`, and `csv` (the file's text). The batch stores only these per-purchase details: the Face value and currency are the Voucher product's, and the Partner is not stored because the Medusa product already says whose voucher it is. The response is the batch and the number imported (`imported`), never the codes.

`purchased_at` is either a day alone, `YYYY-MM-DD`, stored as 00:00 of that day in the plugin's `timezone` option (so `2026-10-01` in `Asia/Bangkok` is `2026-09-30T17:00:00.000Z`), or a date and time (ISO 8601), stored as given. A day that does not exist, such as `2026-02-30`, is refused (400). The admin's import dialog sends the day chosen. Before this, a day alone was stored as 00:00 UTC; batches already stored keep their `purchased_at`.

The CSV needs a header row. `code` is required; `pin`, `valid_from` and `valid_until` are optional; other columns are rejected.

```csv
code,pin,valid_from,valid_until
AAAA-1111-2222,,2026-01-01,31-12-2026
BBBB-3333-4444,1234,,
```

`valid_from` and `valid_until` are dates only, as `YYYY-MM-DD` or `DD-MM-YYYY`, and each counts as the whole of that day in the plugin's `timezone` option (an IANA zone, `Asia/Bangkok` by default): a voucher is valid from 00:00 on its `valid_from` date through the end of its `valid_until` date. A time, a two-digit year or a date that does not exist is rejected. Internally the period is stored as instants, `valid_from <= now < valid_until`, like Medusa's own campaigns, with `valid_until` set to 00:00 of the day after the date given. A file is imported whole or not at all: any problem (a bad date, an empty code, a code repeated in the file or already stored) rejects it with the line numbers concerned, and never the codes themselves. A file may hold up to 50,000 vouchers.

A refused file is answered with 400 and a body that adds the problems to the error's message:

```json
{
  "type": "invalid_data",
  "message": "The CSV has 2 problem(s), nothing was imported. line 2: valid_from must be a date as YYYY-MM-DD or DD-MM-YYYY; line 3: The code is empty",
  "problems": [
    { "line": 2, "code": "invalid_date", "column": "valid_from" },
    { "line": 3, "code": "empty_code" }
  ],
  "problem_count": 2
}
```

`problems` lists the first 20 problems and `problem_count` counts them all. Each has its `line` in the file (1 is the header) and one of these stable codes, which the admin translates:

| `code` | Problem |
| --- | --- |
| `invalid_csv_row` | The row is not valid CSV or has a different number of columns than the header |
| `no_rows` | The file has no voucher rows |
| `missing_code_column` | The header has no `code` column |
| `unknown_column` | The header has a column the import does not know, named in `column` |
| `too_many_rows` | The file has more vouchers than `max` (50,000) |
| `empty_code` | The row's code is empty |
| `invalid_date` | The date in `column` (`valid_from` or `valid_until`) is not a calendar date as `YYYY-MM-DD` or `DD-MM-YYYY` |
| `period_ends_before_start` | `valid_until` is before `valid_from` |
| `code_repeated_in_file` | The code repeats an earlier line of the file (each later line is listed) |
| `code_already_stored` | The code is already stored |

No problem carries a code or PIN. Any other error, including two imports storing the same code at the same moment, has the message alone.

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
