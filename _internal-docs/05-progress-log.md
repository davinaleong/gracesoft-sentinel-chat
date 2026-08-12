# Progress Log

Companion to `01-milestone-checklist.md`. One entry per work session, newest first. Records what was actually built, decisions made, and anything deferred that needs a human (accounts, credentials, deployment).

---

## 2026-08-13 — Milestone 0: Monorepo Foundation

**Status:** Complete, except the optional Turborepo/Nx stretch item (skipped — not needed yet at this package count; revisit if build times become a problem).

**What was built:**
- `pnpm-workspace.yaml` (`packages/*`, `apps/*`) + root `package.json` with fan-out scripts (`build`, `test`, `lint`, `typecheck`, `boundaries`, `changeset`, `release`).
- `@gracesoft-sentinel/config-tsconfig` — shared `base.json` (strict, ES2022, NodeNext) and `library.json` (composite build, declarations).
- `@gracesoft-sentinel/config-eslint` — shared ESLint 9 flat config (`@eslint/js` + `typescript-eslint` recommended), consumed by a single root `eslint.config.js`.
- `.dependency-cruiser.cjs` — boundary rules: (1) no package may import another package's internals, only its `index.ts`/declared export; (2) `agent-*` packages may not import `channel-*` or `provider-*` directly; (3) no circular deps; (4) orphan-module warning.
- `.github/workflows/ci.yml` — install → lint → typecheck → boundaries → test → build, on push/PR to `main`.
- Changesets configured (`.changeset/config.json`, restricted access, `main` as base branch) for independent per-package versioning.
- 8 empty package skeletons, each with `package.json` (correct `@gracesoft-sentinel/*` name + `exports` field), `tsconfig.json` extending the shared library config, a placeholder `src/index.ts`, and a smoke test: `core`, `agent-concierge`, `agent-cook`, `channel-whatsapp`, `channel-telegram`, `provider-ai-openai`, `provider-calendar-google`, `provider-drive-google`.

**Verified locally (all green):** `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm boundaries` (dependency-cruiser: 0 violations across 52 modules), `pnpm test` (8/8 packages), `pnpm build` (8/8 packages), plus an isolated `cd packages/core && pnpm test && pnpm build`.

**Decisions made without a stop-and-ask (all low-stakes/reversible, flagged here for visibility):**
- Package manager: pnpm, as the checklist already recommended and it was already available locally.
- Test runner: Vitest (ESM-native, fast, no config needed beyond the default).
- `boundaries` script currently only cruises `packages/` — `apps/` doesn't exist yet. Will extend the glob to include `apps` once Milestone 8 creates the two service apps.

**Nothing deferred to the user for this milestone** — no external accounts/credentials were needed.

**Next:** Milestone 1 — Core Contracts (`@gracesoft-sentinel/core`).
