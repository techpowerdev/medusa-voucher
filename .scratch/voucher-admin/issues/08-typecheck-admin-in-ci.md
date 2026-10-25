# 08: Type-check the admin code in `pnpm typecheck` and CI

**What to build:** `pnpm typecheck` also checks `src/admin` with its own `tsconfig.json` (the admin uses the browser's types and JSX, so it cannot share `tsconfig.typecheck.json`), and CI fails when the admin code does not type-check. AGENTS.md drops the pitfall that tells agents to run `npx tsc -p src/admin/tsconfig.json` by hand.

**Blocked by:** none.

**Status:** ready-for-agent

- [x] `pnpm typecheck` fails on a type error in `src/admin` (shown with a deliberate error, then removed)
- [ ] CI runs it through the existing `pnpm typecheck` step
- [x] AGENTS.md's Commands and Known pitfalls say so
