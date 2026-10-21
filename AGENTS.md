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
3. **Run the full check after every change to code or models:** `pnpm lint && pnpm typecheck && pnpm build`, then the tests that apply (PostgreSQL required). After changing a data model also run `pnpm db:generate` and commit the migration; a second run must report no new migration.
4. **Status and type values are TypeScript string enums** passed to `model.enum(...)` (see Conventions). Never use `as const` arrays or string literals for them.
5. **Write pull requests and commit messages in Thai**, keeping the Conventional Commits prefix, identifiers, commands and paths in English.
6. **Never commit, push, merge, or change GitHub settings** unless the user asks for that action in the current conversation.

## Layout

Source lives in `src/`; each directory maps to a Medusa resource type and is registered automatically in the host app:

`admin/` (widgets, pages, `i18n/`) · `api/admin`, `api/store` (routes, `middlewares.ts`) · `jobs/` · `links/` · `modules/` · `providers/` · `subscribers/` · `workflows/`

Empty directories hold a `.gitkeep`; delete it when adding the first real file.

## Conventions

- Use the terms in `GLOSSARY.md` for models, API fields, events and docs (a code is a **Voucher**, an import is a **Voucher batch**, and so on) and avoid the listed synonyms. Update the glossary when a term changes; record hard-to-reverse decisions as ADRs in `docs/adr/`.
- Medusa v2 only (`@medusajs/*` pinned to the same version in dev and peer dependencies — keep them in sync when upgrading).
- Business logic belongs in workflows and module services; API routes stay thin.
- Define status/type values as TypeScript string enums (see `src/modules/voucher/constants.ts`) and pass the enum straight to `model.enum(...)` with `.default(Enum.VALUE)`, the way Medusa's own modules do. Do not use `as const` arrays: they are readonly and `model.enum` rejects them.
- Imports inside the plugin must be relative (never `@khumkha/medusa-voucher/...`).
- Project skills live in `.agents/skills/` (`building-with-medusa`, `building-admin-dashboard-customizations`, `building-storefronts`; symlinked into `.claude/skills/`). Load the matching one before any Medusa backend or admin UI work, and `building-storefronts` when calling this plugin's store API routes from a storefront. Manage them with `pnpm dlx skills update` / `list` (lock file: `skills-lock.json`).
- Medusa docs for LLMs: https://docs.medusajs.com/llms.txt — consult it instead of guessing Medusa v2 APIs.
- Keep `exports` in `package.json` as generated; they expose `workflows`, `modules/*`, `providers/*` and `admin`.
- `exports["./workflows"]` points to `src/workflows/index.ts`, which does not exist yet. When adding the first workflow, create that file and re-export every workflow (and hooks) from it, otherwise `@khumkha/medusa-voucher/workflows` cannot be imported.

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
