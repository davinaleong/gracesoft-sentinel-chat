# Progress Log

Companion to `01-milestone-checklist.md`. One entry per work session, newest first. Records what was actually built, decisions made, and anything deferred that needs a human (accounts, credentials, deployment).

---

## 2026-08-13 — Milestone 2: Concierge Agent Core (`agent-concierge`)

**Status:** Complete.

**What was built:** the implementation (business-hours resolution, slot engine, booking-intent parsing, booking-state/multi-turn selection, FAQ matcher, `handleMessage()` orchestrator) landed in the prior commit as WIP; this session added the unit test suite that was explicitly deferred at the time, plus everything the tests turned up:
- `business-hours.test.ts`, `slot-engine.test.ts`, `booking-intent.test.ts`, `booking-state.test.ts`, `faq-matcher.test.ts` — focused unit tests per module.
- `handle-message.test.ts` — end-to-end `handleMessage()` scenarios covering every branch in the test checklist: all three no-date/time paths (offer/pick/reject-all), date+time (available/unavailable), date-only, all three time-only paths (in-hours/today-unavailable-rolls-over/outside-hours), the 2-May-exclusion regression at the `handleMessage` level (not just the slot-engine level), timezone/label consistency from offer through confirmation, and all four FAQ scenarios including escalation-preserves-context.
- `test-support.ts` — shared fixtures (a `RecordingCalendarProvider` fake that tracks `createBooking` calls and computes free/busy windows from explicit busy ranges, the regression-scenario `BusinessHours`/`BusinessConfig`, and a small FAQ blueprint), reused across all the above.

**Bug found and fixed by the new tests:** `resolveSlotSelection` (`booking-state.ts`) mis-resolved free-text ordinal selection — "I'll take the 2nd one" resolved to slot 1, not slot 2. Root cause: the old `ORDINAL_WORDS` map was searched via `Object.entries().find()` in insertion order, and the bare word "one" (present as a noun in "...2nd **one**", not as an ordinal) happened to be checked before "2nd". Fixed by replacing it with an explicit `ORDINAL_PATTERNS` priority list — digit and digit-suffix forms (`1`/`1st`) and ordinal words (`first`/`second`/`third`) are checked before the genuinely ambiguous bare number words (`one`/`two`/`three`). Logged in `02-test-checklist.md`'s regression table so it can't silently reappear.

**Verified locally (all green):** `pnpm typecheck`, `pnpm lint`, `pnpm boundaries` (0 violations, 85 modules/150 dependencies), `pnpm build`, `pnpm test` (82/82 tests workspace-wide, 62/62 in `agent-concierge` alone, zero network calls — every test drives `handleMessage()` through in-memory fakes). Confirmed via `grep` that `agent-concierge/src` has no `channel-*`/`provider-*` imports (only `@gracesoft-sentinel/core` and `dayjs`).

**Decisions made without a stop-and-ask (low-stakes/reversible, flagged here for visibility):**
- The Milestone 2 deliverable list mentions wiring to `AIProvider`, but neither FAQ matching (Jaccard keyword-overlap) nor booking-intent parsing (regex-based) call an LLM — both are deterministic by design (see the "not an LLM call" comments already in `faq-matcher.ts`/`booking-intent.ts` from the prior session). So `agent-concierge` currently has no `AIProvider` import at all; `CalendarProvider` is the only external interface it consumes. This isn't a deviation so much as the interface simply not being needed yet — revisit only if a future requirement (e.g. free-form NLU) needs it.

**Nothing deferred to the user for this milestone** — no external accounts/credentials were needed.

**Next:** Milestone 3 — Cook Agent Core (`agent-cook`).

---

## 2026-08-13 — Milestone 1: Core Contracts (`@gracesoft-sentinel/core`)

**Status:** Complete.

**What was built:** all contracts as Zod schemas (source of truth) with `z.infer`-derived TS types, plus hand-written interfaces for anything with methods:
- `channel.ts` — `ChannelId` (open string union: known ids autocomplete, unknown ones still typecheck).
- `message.ts` — `NormalizedMessage` / `NormalizedResponse`, `NormalizedMedia`, `QuickReply`.
- `channel-adapter.ts` — `ChannelAdapter` interface + `runChannelAdapterContractTests()`, a shared Vitest suite any channel package imports and runs against its own fixtures (fixtures are necessarily channel-specific; the invariants checked — valid `NormalizedMessage` out, consistent channel id, `formatOutbound` doesn't throw — are not).
- `ai-provider.ts` — `AIProvider` interface (`chatComplete`/`visionAnalyze`/`embed`) + I/O schemas + `runAIProviderContractTests()`.
- `calendar-provider.ts` — `CalendarProvider` interface + I/O schemas + `runCalendarProviderContractTests()`. `BusinessHours` models non-business days as a dated `exceptions` array rather than mutating the weekly map — this is the shape Milestone 2's business-hours bug fix (2 May excluded, rollover to 4 May) will be built on.
- `recipe-source-provider.ts` — minimal `RecipeSourceProvider` interface, kept deliberately small since it's a Milestone 11 future concern with no consumer yet.
- `conversation-state.ts` — `ConversationState`, with an open `context` bag each agent owns the shape of.
- `business-config.ts` — `BusinessConfig`, composing `BusinessHours` from `calendar-provider.ts`.

Each contract test suite is dogfooded in `core`'s own test files against a trivial in-memory fake implementation, proving the suites themselves are correct before any real channel/provider exists to run them against.

**Verified locally (all green):** `pnpm typecheck`, `pnpm lint`, `pnpm test` (20/20 tests across 6 files in `core`, 8/8 packages workspace-wide), `pnpm build`, `pnpm boundaries` (0 violations across 94 modules/110 dependencies).

**"Publish package internally, tag v0.1.0 via Changesets":** this is a private monorepo with no npm registry configured (`"private": true`, no `publishConfig`/registry set up), so there is no real publish target yet — that arrives if/when a package needs to be consumed outside this repo. Interpreted the checklist item as "cut the initial release" instead: wrote `packages/core/CHANGELOG.md` in Changesets' own format and will tag `@gracesoft-sentinel/core@0.1.0` in git once this commit lands (Changesets' own tag convention). No changeset file was added for this change since a package's first release doesn't need one — the `pnpm changeset` flow starts mattering from the next change to `core` onward.

**Nothing deferred to the user for this milestone** — no external accounts/credentials were needed.

**Next:** Milestone 2 — Concierge Agent Core.

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
