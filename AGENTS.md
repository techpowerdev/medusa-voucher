# @khumkha/medusa-voucher

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, Gemini CLI, etc.). `CLAUDE.md` and `GEMINI.md` import this file — edit rules here only.

Medusa v2 **plugin** (not a Medusa app) for reselling vouchers issued by third-party partners: codes are bought in advance, imported in batches, sold as ordinary products, allocated to orders after payment and delivered to customers. See `GLOSSARY.md` for the domain language and `docs/adr/` for the decisions behind it. It is consumed by a Medusa app via `plugins: [{ resolve: "@khumkha/medusa-voucher", options: {} }]` in `medusa-config.ts`.

## Commands

Node: 22 (`.nvmrc`; run `nvm use`).

Package manager: **pnpm** (pinned in `package.json`; use `pnpm`, never `npm`/`yarn`). Native build scripts are allowed only for `@swc/core` and `esbuild` via `onlyBuiltDependencies` in `pnpm-workspace.yaml`; `.npmrc` hoists the `@medusajs/*` and admin packages the plugin build needs.

- `pnpm build` — `medusa plugin:build` (output in `.medusa/server`, git-ignored)
- `pnpm dev` — `medusa plugin:develop` (watch + push to the local registry; run the host app's dev server in another terminal)
- `pnpm lint` — `medusa lint`
- `pnpm typecheck` — type-check `src/` **including tests** (`tsconfig.json` excludes tests and Jest runs through SWC, which does not check types)
- `pnpm test:unit` — unit tests, `src/**/__tests__/**/*.unit.spec.ts` (no database)
- `pnpm test:integration:modules` — module integration tests, `src/modules/*/__tests__/` (needs PostgreSQL)
- `pnpm test:integration:http` — builds the plugin, then runs `integration-tests/http/*.spec.ts` against a real Medusa app that loads the plugin from `.medusa/server` (needs PostgreSQL and generated migrations)
- `pnpm medusa plugin:publish` — publish to the local registry (yalc); in the host app run `pnpm medusa plugin:add @khumkha/medusa-voucher`
- `pnpm db:generate` — `medusa plugin:db:generate`: generate migrations for the plugin's modules into `src/modules/*/migrations/` (needs PostgreSQL and `.env`). Commit them; the host app applies them with `medusa db:migrate`. Regenerate whenever a data model changes.

## Environment

- `docker compose up -d` starts a local PostgreSQL (`postgres`/`postgres`, port 5432). If that port is already used by another database, set `POSTGRES_PORT` (docker compose reads it from `.env`) and `DB_PORT` in `.env` and `.env.test` to the same free port, for example 5433. Never stop or reuse another project's database.
- Copy `.env.template` → `.env` (for `db:generate`) and `.env.test.template` → `.env.test` (for module tests). Real `.env*` files are git-ignored; never commit them.
- HTTP integration tests use `medusaIntegrationTestRunner` with `integration-tests/medusa-config.ts` (a test-only app that registers this plugin via `resolve: path.resolve(__dirname, "..")`). `medusaConfigFile` must be an absolute path. The runner applies the plugin's migrations, so run `pnpm db:generate` after any model change. Add API route and workflow tests here as the plugin gains them (`integration-tests/http/plugin.spec.ts` only proves the plugin loads).
- Tests (`__tests__/`, `integration-tests/`) are excluded from `tsconfig.json`, so they are not compiled into the published build.
- **Dev app for screen checks (rule 13):** `../medusa-voucher-dev-app`, a Medusa app on the same Medusa version, outside this repo, made from Medusa's `dtc-starter` (the older `nextjs-starter-medusa` is deprecated). The backend is in `apps/backend` and the Next.js storefront in `apps/storefront`, with its `@medusajs/*` packages pinned to the backend's version. A Thailand region (THB, the store's default currency) sells through the storefront with a free "Email delivery" shipping option and the system payment provider, which only authorizes: capture the payment in the admin. It uses pnpm 10 (`packageManager`), the database `medusa_voucher_dev_app` in this project's PostgreSQL container, and no Redis (never point it at another project's Redis). Its `medusa-config.ts` registers the plugin and the Notification module with `@perseidesjs/notification-nodemailer` sending to Mailpit, as the README describes. To run a change:
  1. In this repo: `docker compose up -d`, then `pnpm medusa plugin:publish`.
  2. In `../medusa-voucher-dev-app`: `docker compose up -d` (Mailpit: SMTP on 1025, inbox at http://localhost:8025).
  3. In `apps/backend`: `npx medusa plugin:add @khumkha/medusa-voucher`, `npx medusa db:migrate`, then `npx medusa develop` (admin at http://localhost:9000/app).
  4. In `apps/storefront`: `pnpm dev` (store at http://localhost:8000/th; the publishable key is in its `.env.local`). Buy there as a customer, then capture the payment in the admin.
  5. Until delivery starts on its own: `npx medusa exec ./src/scripts/deliver-order-vouchers.ts <order_id>`.
- CI (`.github/workflows/ci.yml`) runs lint, build, a migration drift check, unit, module and HTTP tests against a PostgreSQL service.
- `.github/workflows/update-medusa.yml` (from the official Medusa plugin starter, with `actions/checkout` bumped to v4) is a manually triggered workflow that opens a PR bumping the `@medusajs/*` versions (the action detects pnpm and enables corepack). Review that PR: it must keep dev and peer versions in sync and update `pnpm-lock.yaml`.

## Upgrading Medusa

Per the Medusa docs, a plugin project only needs its `@medusajs/*` dependencies bumped and reinstalled.

1. Find the latest versions: `pnpm view @medusajs/medusa version` (core packages share one version) and `pnpm view @medusajs/ui version` (`@medusajs/ui` is versioned independently).
2. Edit `package.json`: set every `@medusajs/*` entry to the same version in **both** `devDependencies` and `peerDependencies` (`@medusajs/ui` gets its own version).
3. `pnpm install`, then confirm with `pnpm medusa -v` (CLI and Medusa versions must match).
4. Verify: `pnpm lint && pnpm build && pnpm test:unit && pnpm test:integration:modules && pnpm test:integration:http` (start PostgreSQL first). Minor releases can contain breaking changes; look for `@deprecated` warnings and read the release notes.
5. Update the minimum version in `README.md` ("Compatibility"). The manually triggered `update-medusa.yml` workflow can open this PR for you; review it against these steps.

## Rules for AI agents

These come from mistakes already made in this repo. Follow them every time.

1. **Check how Medusa does it before writing Medusa code.** In this order: the project skills in `.agents/skills/` (and their `reference/` files), then the source of Medusa's own modules in `node_modules/@medusajs/*` (for example how `order` or `promotion` define models and use `model.enum`), then https://docs.medusajs.com/llms.txt. Copy the pattern Medusa uses; do not invent one that merely compiles.
2. **Verify, do not assume.** Run the code or the type-checker to confirm a claim before stating it, and say plainly what was not verified. An assumption that something "cannot be done" must be tested first (the HTTP integration test was once dropped on an untested assumption and later worked fine).
3. **Run the full check after every change to code or models:** `pnpm lint && pnpm typecheck && pnpm build`, then the tests that apply (PostgreSQL required). After changing a data model also run `pnpm db:generate` and commit the migration; a second run must report no new migration. That second run proves only that the snapshot matches the models, not that the migrations create everything: when replacing an uncommitted migration, first restore the committed `.snapshot-*.json` (`git checkout`) and delete only the migration being replaced, then let `pnpm test:integration:http` confirm, since it builds the database from the migrations alone.
4. **Status and type values are TypeScript string enums** passed to `model.enum(...)` (see Conventions). Never use `as const` arrays or string literals for them.
5. **Write pull requests and commit messages in Thai**, keeping the Conventional Commits prefix, identifiers, commands and paths in English.
6. **Never commit, push, merge, or change GitHub settings** unless the user asks for that action in the current conversation.
7. **Spec first, then tickets, then code.** A new feature or behaviour change needs a spec and tickets in `.scratch/` that the user approved (skills: `grill-with-docs` → `to-spec` → `to-tickets`). Do not start from an idea in the conversation. If a project skill cannot be invoked, read its `SKILL.md` and follow it, and say that you did.
8. **Real TDD, at agreed seams.** Before the first test, state the seams and get the user's confirmation. Write one test, run it, and see it fail for the expected reason before writing any code for it; write only what that test needs. If a test passes on its first run, say so in the report instead of presenting it as red → green. Expected values come from the spec or a worked example, never recomputed the way the code does (for example, do not assert a `code_hint` you guessed: it depends on the code's length). Changing a test to make it pass needs a stated reason.
9. **Do not store what Medusa already knows.** Before adding a field or model, check whether a Medusa product, variant, order or metadata already says it (the Partner field was dropped because the Medusa product names it). Ask when unsure; removing a stored field later costs more than adding one.
10. **Report faithfully.** Every handoff lists what was not verified, every deviation from the agreed design or seam, tests that never went red, and any step the user must take. Do not describe something as done or tested when it was only written.
11. **No leftovers.** No `console.log` or debug markers in `src/` or `integration-tests/` (CI fails on them), no commented-out code, no files outside the task.
12. **Say what you are doing during long runs.** Before a multi-step command sequence, state in one line what and why; do not go silent while builds and tests run.
13. **Check every change on a real screen and put screenshots in the PR.** Passing tests are not enough. Before the handoff, run the change in the dev app (see Environment) and use it the way a reviewer or customer would: buy through the storefront, then look at the admin page, the store API response, or the email received in Mailpit. When nothing starts it from a screen yet, start it with `medusa exec` and capture what comes out (for example the email). Upload the screenshots to the PR's Evidence section through GitHub in the browser (user-attachments links; never commit them to the repo), and say under each what it shows. This holds even though the `pr` skill does not ask for screenshots (it comes from `mattpocock/skills`, so edits there would be overwritten). If something could not be checked on screen, say so in the PR and in the handoff.
14. **In the admin, use what the dashboard already exports before writing your own.** Before writing an admin page or widget, read the exports of `@medusajs/dashboard/components`, `@medusajs/dashboard/hooks` and `@medusajs/dashboard/lib` (`node_modules/@medusajs/dashboard/dist/{components,hooks,lib}.d.ts`) and a similar page in `node_modules/@medusajs/dashboard/src/routes`, and build the same way: `DataTable` for tables (pages and filters kept in the URL, `rowHref`, translated pager), `useQueryParams`, `useDate`, `getLocaleAmount`, breadcrumbs through the route's `handle`, and `throw error` so the dashboard's error page shows it. For a word the dashboard already translates, use its word (`node_modules/@medusajs/dashboard/src/i18n/translations/th.json`). Write your own only when nothing there fits, and say why in the handoff. Loading the admin skill and reading `@medusajs/ui` is not enough: the Vouchers pages were first built with hand-made tables, filters, pager translations, money and date helpers and error messages, and had to be redone.
15. **Update the ticket in the PR that finishes it.** Set its `Status:` to `done (PR #N)` and tick its criteria in that same PR, and check that earlier tickets of the same spec are not left stale. Tickets 01, 02 and 06 of the admin spec were left `pending review` or `ready-for-agent` after they were merged.

## Agent skills

### Issue tracker

Specs and tickets are local markdown files under `.scratch/<feature>/` (`spec.md`, `issues/NN-<slug>.md`), committed with the code they describe. See `docs/agents/issue-tracker.md`.

### Triage labels

The default five triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each ticket file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Known pitfalls

Each of these cost time here. All were checked against Medusa 2.21.2 or Node; recheck after upgrading.

- **Shell:** the default shell resolves Node 20 and a global pnpm 11 that fails. Run `source ~/.nvm/nvm.sh && nvm use` before any `pnpm` command. Quote globs and URLs in zsh. BSD `sed` rejects GNU syntax: use the edit tools. `rm dir/*` leaves dotfiles such as `.snapshot-*.json`.
- **Dates:** the data model has no date-only type, only `dateTime`. JavaScript turns `2026-02-30` into 2 March without an error, so validate calendar dates yourself. Periods are half-open: `valid_from <= now < valid_until`.
- **Errors:** Medusa replaces the message of a `CONFLICT` error with a generic retry text; use `DUPLICATE_ERROR` (422) when the message matters, `INVALID_DATA` (400), `NOT_FOUND` (404). A database unique violation arrives as `invalid_data` with a message ending "already exists." and naming the value, so translate it before it can leak a hash.
- **Orders:** the ordered quantity is `items.detail.quantity` in an order query; `items.quantity` is empty. The order of `order.items` is not guaranteed, so find a line by its variant.
- **Links:** to know whether a variant has a Voucher product, query `product_variant` with `voucher_product.id`; a nested array filter on the link returned nothing.
- **Services:** public service methods must be `async`; a method taking a `Context` needs `@InjectManager()` / `@InjectTransactionManager()` and `@MedusaContext()`, as Medusa's own modules do.
- **Migrations:** see rule 3. A second `db:generate` reporting nothing does not prove the migrations are complete; the HTTP tests, which build the database from them, do.
- **Admin build:** `translationNs` in `defineRouteConfig` must be a string literal: the admin build reads it from the source, and with a constant the sidebar shows the raw key. Plugin translations are `{ en: { "<namespace>": {...} }, th: {...} }` in `src/admin/i18n/index.ts`. `pnpm typecheck` excludes `src/admin`; check it with `npx tsc -p src/admin/tsconfig.json`. The dashboard's `DataTable` shows a search box unless `enableSearch={false}`, and stores each filter in the URL as JSON, `null` while it has no value yet.
- **Dev app admin:** after `plugin:add`, Vite keeps serving the old plugin admin from `apps/backend/node_modules/.vite`. Stop the backend, delete that folder, start it again and hard-reload the browser. A restart also ends the admin session. The admin's language follows the user's profile (Settings → Profile), not the browser's `lng` key.

## Layout

Source lives in `src/`; each directory maps to a Medusa resource type and is registered automatically in the host app:

`admin/` (widgets, pages, `i18n/`) · `api/admin`, `api/store` (routes, `middlewares.ts`) · `jobs/` · `links/` · `modules/` · `providers/` · `subscribers/` · `workflows/`

Empty directories hold a `.gitkeep`; delete it when adding the first real file.

## Conventions

- Use the terms in `GLOSSARY.md` for models, API fields, events and docs (a code is a **Voucher**, an import is a **Voucher batch**, and so on) and avoid the listed synonyms. Update the glossary when a term changes; record hard-to-reverse decisions as ADRs in `docs/adr/`.
- Medusa v2 only (`@medusajs/*` pinned to the same version in dev and peer dependencies — keep them in sync when upgrading).
- Business logic belongs in workflows and module services; API routes stay thin.
- Define status/type values as TypeScript string enums (see `src/modules/voucher/constants.ts`) and pass the enum straight to `model.enum(...)` with `.default(Enum.VALUE)`, the way Medusa's own modules do. Do not use `as const` arrays: they are readonly and `model.enum` rejects them.
- Voucher codes and PINs are secrets. Only `createVouchersFromCodes` may create vouchers and only `revealVoucher` may decrypt them. The CRUD methods that `MedusaService` generates (`createVouchers`, `updateVouchers`, `listVouchers`, ...) accept and return the encrypted columns, so never expose them directly through an API route or admin endpoint: use dedicated routes that strip `code_encrypted`, `pin_encrypted` and `code_hash` from responses, check authorization before revealing a code, and never write codes or PINs to logs or error messages (report positions or ids instead).
- Imports inside the plugin must be relative (never `@khumkha/medusa-voucher/...`).
- Project skills live in `.agents/skills/` (`building-with-medusa`, `building-admin-dashboard-customizations`, `building-storefronts`; symlinked into `.claude/skills/`). Load the matching one before any Medusa backend or admin UI work, and `building-storefronts` when calling this plugin's store API routes from a storefront. Manage them with `pnpm dlx skills update` / `list` (lock file: `skills-lock.json`).
- Workflow skills from `mattpocock/skills` are in the same folder. Work flows grill (`grill-with-docs`) → `to-spec` → `to-tickets` → `tdd` / `implement` → `pr`; run `setup-matt-pocock-skills` again only to change the issue tracker. Write a spec and its tickets before building a new feature, and keep them in `.scratch/`.
- Medusa docs for LLMs: https://docs.medusajs.com/llms.txt — consult it instead of guessing Medusa v2 APIs.
- Keep `exports` in `package.json` as generated; they expose `workflows`, `modules/*`, `providers/*` and `admin`.
- `exports["./workflows"]` points to `src/workflows/index.ts`. Re-export every new workflow (and hooks) from it, otherwise `@khumkha/medusa-voucher/workflows` cannot import it.

## Branching

- `main`: released code only. It changes by merging `develop` for a release (then tag the version).
- `develop`: integration branch. All work lands here through pull requests.
- `feature/<name>`, `fix/<name>`, `chore/<name>`: short-lived branches created from `develop` and merged back into `develop` by pull request.
- CI runs on pull requests and on pushes to `main` and `develop`. The `update-medusa.yml` workflow opens its pull request against `develop`.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `ci:`).
- Pull requests and commit messages are always written in Thai (PR title and description; commit subject and body). Keep the Conventional Commits prefix, code identifiers, commands and file paths in English.

## Using this repo as a template for a new plugin

1. Copy the project (without `node_modules`, `.medusa`, `.git`, `.env*`), then `git init`.
2. Rename everywhere `voucher` / `@khumkha/medusa-voucher` appears (also `publishConfig.access` in `package.json`: scoped packages need `public` to be published publicly): `package.json` (`name`, `description`, `keywords`), `README.md`, this file (title, description, `plugins: [{ resolve }]` example), `docker-compose.yml` (`POSTGRES_DB`) and `.env.template` (`DB_NAME`). `grep -ri voucher .` should find only the module to replace.
3. Replace `GLOSSARY.md` and `docs/adr/` with the new plugin's domain language and decisions, and replace the placeholder module `src/modules/voucher` (models, service, `VOUCHER_MODULE` constant, `migrations/`, `__tests__/service.spec.ts`, and the import in `integration-tests/http/plugin.spec.ts`) with the new plugin's module — or delete it and start from the empty `src/` directories. Keep at least one `.ts` file under `src/`, otherwise `pnpm build` fails with TS18003.
4. Decide on the license: add a `LICENSE` file and `author` / `repository` in `package.json`.
5. `nvm use && pnpm install`, copy the env templates (see Environment), then run `pnpm lint && pnpm build && pnpm test:integration:modules && pnpm test:integration:http` (the HTTP test needs migrations, so run `pnpm db:generate` first).
6. After designing the data models, run `pnpm db:generate` and commit the migrations.
7. Review `skills-lock.json` / `.agents/skills/`: keep only the skills the new plugin needs, and add any others with `pnpm dlx skills add`.
8. Reset `version` in `package.json`, make the first commit on `main`, then create `develop` from it (see Branching) and set it as the default branch on GitHub.
