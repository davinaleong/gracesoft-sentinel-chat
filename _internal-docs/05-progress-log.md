# Progress Log

Companion to `01-milestone-checklist.md`. One entry per work session, newest first. Records what was actually built, decisions made, and anything deferred that needs a human (accounts, credentials, deployment).

---

## 2026-08-13 — Milestone 5: Calendar Provider Layer (`provider-calendar-google`)

**Status:** Complete.

**Extraction source:** legacy `packages/concierge/src/calendar.ts`, `config.ts`, `holidays.ts` in `../gracesoft-sentinel-whatsapp`. Legacy used the `googleapis` SDK with service-account JWT auth (`google.auth.JWT` + calendar scope), calling `freebusy.query` and `events.insert` directly from concierge flow code. Business hours were a **hardcoded fixed-slot array** (`AVAILABLE_HOURS = [9,10,11,14,15,16]`, 60-min slots) plus a hardcoded `Set` of Singapore public holidays for 2025-2026 in `holidays.ts` — exactly the design Milestone 2's `BusinessHours` (weekly map + dated exceptions) model replaced.

**⚠️ Security note, not a code change:** the legacy repo has a live-looking GCP service-account key committed at its root — `../gracesoft-sentinel-whatsapp/gracesoft-sentinel-concierge-403f8f35c65a.json`. Did not open or copy it. Flagging for the user: that file should not be carried into this repo, and if it's a real still-active credential it likely needs rotation regardless, since it's sitting in git history. Not something I can fix by editing files here — needs a human decision (rotate the key, scrub git history if desired).

**What was built:**
- `google-calendar-client.ts` — `GoogleCalendarClient`, a minimal interface covering only the two Google Calendar endpoints actually used (`freebusy.query`, `events.insert`), plus `createGoogleCalendarClient()` building the real authenticated `googleapis` client (same JWT service-account auth as legacy, isolated behind this interface instead of called directly from agent/flow code). Testing substitutes a plain in-memory fake implementing this interface — no HTTP mocking needed, unlike `provider-ai-openai`'s approach with the OpenAI SDK.
- `free-busy.ts` — `invertBusyToFree()`: the Google Calendar API reports *busy* periods, but `CalendarProvider.getAvailability` (per core's own dogfood fake) returns *free* windows — this inverts one into the other within the queried range. Pure, thoroughly unit-tested function (6 tests: no busy time, single/multiple busy blocks, full-range busy, malformed entries, out-of-range clipping).
- `google-calendar-provider.ts` — `GoogleCalendarProvider implements CalendarProvider`. `getBusinessHours()` returns a `BusinessHours` object supplied at construction time (constructor config), not hardcoded — Google Calendar has no native "business hours" concept for a regular resource calendar, so real per-business hours/holiday data (e.g. the Singapore public-holiday CSVs already sitting in `_internal-docs/data/`) get wired in at Milestone 8's service composition, not baked into this package. `createBooking` maps `CreateBookingInput.attendee` onto Google's `attendees` field only when the contact looks like an email (Google's API expects an actual email address there, and the legacy version never populated attendees at all — improvement, not a behavior change to preserve).
- `createGoogleCalendarProviderFromEnv(env, businessHours)` — reads `GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (both required, clear errors if missing), mirrors `createOpenAIProviderFromEnv`'s shape from Milestone 4. `businessHours` is passed as a parameter rather than sourced from env, since it's structured business data.

**Verified locally (all green):** `pnpm typecheck`, `pnpm lint`, `pnpm boundaries` (0 violations), `pnpm build`, `pnpm test` — 17/17 new tests in `provider-calendar-google`, 117/117 workspace-wide, zero network calls (fake client, no HTTP layer at all). Confirmed via `grep` that `agent-concierge/src` has no `googleapis` import.

**Nothing deferred to the user for this milestone** beyond the security flag above — no live Google credentials were needed or used.

**Next:** Milestone 6 — WhatsApp Channel (`channel-whatsapp`).

---

## 2026-08-13 — Milestone 4: AI Provider Layer (`provider-ai-openai`)

**Status:** Complete.

**What was built:**
- `openai-provider.ts` — `OpenAIProvider implements AIProvider`, wrapping the `openai` npm SDK (v4). `chatComplete`/`visionAnalyze` both go through `client.chat.completions.create` (vision as a `user` message with `image_url`/`text` content parts, base64 images turned into a `data:` URI); `embed` goes through `client.embeddings.create` with `encoding_format: "float"` explicitly set — the SDK defaults to `"base64"` and decodes it client-side into a `Float32Array` when unset, which doesn't match a plain-JSON mocked response and silently produced empty vectors until this was set explicitly (caught by the contract suite, see below).
- `createOpenAIProviderFromEnv(env)` — reads `OPENAI_API_KEY` (required, throws a clear error if missing) plus optional `OPENAI_MODEL`/`OPENAI_VISION_MODEL`/`OPENAI_EMBEDDING_MODEL`. This is the "config resolution" checklist item, scoped down: since `provider-ai-openai` is the only real `AIProvider` implementation that exists yet, there's nothing to branch an `AI_PROVIDER=openai|...` switch on. Full multi-provider env resolution is deferred to Milestone 8's service-wiring composition root, where it'll actually have >1 case.
- `openai-provider.test.ts` — runs `core`'s shared `runAIProviderContractTests` against `OpenAIProvider` wired to a mocked `fetch` (via the SDK's own `fetch` constructor override) returning canned OpenAI-shaped JSON — no live network calls.
- `stub-ai-provider.test.ts` — the Milestone 4 stretch goal: an `EchoAiProvider`, a deliberately non-OpenAI-shaped, non-HTTP `AIProvider` implementation (no "model" concept, no `response_format`), running the *same* shared contract suite. Passing proves `AIProvider` genuinely generalises rather than being OpenAI's API surface with the serial numbers filed off.

**Verified locally (all green):** `pnpm typecheck`, `pnpm lint`, `pnpm boundaries` (0 violations), `pnpm build`, `pnpm test` — 10/10 new tests in `provider-ai-openai` (7 contract + 3 stub-contract... actually 3 request-shaping/env tests, contract suite itself contributes more), 100/100 workspace-wide. Confirmed via `grep` that neither `agent-concierge` nor `agent-cook` import the `openai` package directly.

**Decisions made without a stop-and-ask (low-stakes/reversible, flagged here for visibility):**
- The `openai` SDK's Node type shims assume a `node-fetch`-shaped `Response`; Node's native global `Response` (used in the mock) is structurally close but not identical (missing `node-fetch`-only fields like `buffer`/`size`). Cast through `unknown` in the test's mock fetch — a test-only type affordance, doesn't affect runtime behavior against the real API.

**Nothing deferred to the user for this milestone** — no live OpenAI API key was needed or used; a real key becomes necessary only when someone runs this against the live API (Milestone 8 deployment or later), which is out of scope for this pass.

**Next:** Milestone 5 — Calendar Provider Layer (`provider-calendar-google`).

---

## 2026-08-13 — Milestone 3: Cook Agent Core (`agent-cook`)

**Status:** Complete.

**Extraction source:** the legacy monolith at `../gracesoft-sentinel-whatsapp/packages/cook` (found alongside `packages/ai-provider`, `packages/gateway-core`, etc. — the "WhatsApp-only apps" the whole rearchitecture is migrating away from). Read `ai.ts` (single combined vision call returning dish + full recipe as JSON), `flow.ts` (session state machine: prompt for photo → analyse → done), `formatter.ts` (WhatsApp-asterisk-formatted text), and `faq.ts` (simple substring-keyword FAQ, **not** carried over — Milestone 3's deliverables/checklist don't list a Cook FAQ, unlike Concierge's explicit FAQ deliverable, so adding one would be scope creep).

**What was built, and how it differs from the legacy version:**
- `dish-classifier.ts` — `classifyDish(imageUrl, aiProvider)`, using `AIProvider.visionAnalyze` only, to get *just* the dish name (or a `null` + reason if unidentifiable). Split out from recipe generation on purpose, per the Milestone 3 deliverable list ("image → `visionAnalyze` → dish name" as one flow, "dish name → `chatComplete` → structured recipe" as a separate one) — the legacy version did both in a single vision call. The benefit isn't just architectural: an ambiguous photo now short-circuits before ever calling `chatComplete`, instead of generating a full (fabricated) recipe for an unidentified dish.
- `recipe-generator.ts` — `generateRecipe({dishName, aiProvider, dietaryAdjustment?, baseRecipe?})`, using `AIProvider.chatComplete`. Recipe shape gained `substitutions`/`servingSuggestions` as first-class structured fields (legacy only had free-text steps/ingredients/nutrition). The dietary-adjustment path feeds the *existing* recipe's ingredients/steps back into the prompt so the model adjusts in place ("swap chicken for tofu") rather than regenerating a possibly-unrelated recipe from scratch.
- `dietary-adjustment.ts` — `isDietaryAdjustmentRequest()`, a small deterministic keyword detector (vegetarian/vegan/gluten-free/halal/etc.), same "not an LLM call" philosophy as `agent-concierge`'s `booking-intent.ts`.
- `formatter.ts` — `formatRecipe`/`formatUnidentifiedDish`. Deliberately **plain text, no WhatsApp-style asterisks** — the legacy formatter baked WhatsApp markdown directly into the agent layer, which breaks the "channel-agnostic" principle this whole rearchitecture exists for. Markup translation belongs in `ChannelAdapter.formatOutbound()` (Milestone 6/7), not here.
- `handle-message.ts` — `handleMessage()`: a photo always wins (classify + generate, replacing whatever state existed); otherwise a dietary-adjustment request against `context.lastRecipe` is handled in place; otherwise prompts for/reminds about a photo. AI failures (thrown errors from either provider call) are caught and turned into a plain apology rather than propagating — matches the legacy `try/catch` behavior in `flow.ts`, now living in the platform-agnostic layer instead of tied to WhatsApp.
- `test-support.ts` — a `FakeAiProvider` implementing all three `AIProvider` methods (only `chatComplete`/`visionAnalyze` are exercised; `embed` throws if called, since nothing here should call it), plus scripted happy-path/unidentified-dish fixtures.

**Verified locally (all green):** `pnpm typecheck`, `pnpm lint`, `pnpm boundaries` (0 violations), `pnpm build`, `pnpm test` — 25/25 new tests in `agent-cook`, 90/90 workspace-wide, zero network calls. Confirmed via `grep` that `agent-cook/src` has no `channel-*`/`provider-*` imports.

**Nothing deferred to the user for this milestone** — no external accounts/credentials were needed (the legacy repo's real OpenAI/Anthropic keys were never touched; everything here runs against the `AIProvider` interface and fakes).

**Next:** Milestone 4 — AI Provider Layer (`provider-ai-openai`).

---

## 2026-08-13 — Milestone 2 addendum: FAQ matcher redesigned to be LLM-grounded

**Status:** Complete. Supersedes the "no `AIProvider` import" decision note in the entry below.

**Why:** real FAQ content arrived (`_internal-docs/data/faq-blueprint.json`, GraceSoft's own site content) and it isn't a Q&A list — it's explicitly structured as grounding context for an LLM (`system_prompt`, `knowledge_base`, `guardrails`, `escalation_policy`, `example_exchanges`), with its own schema comment stating it should be "fed as the system prompt / retrieval context rather than as a trigger-phrase lookup table". The keyword/Jaccard matcher built in the original Milestone 2 pass couldn't consume this shape at all. Asked the user how to reconcile it; chose to switch FAQ matching to be fully LLM-grounded rather than keep the deterministic matcher or run a hybrid.

**What changed:**
- `faq-matcher.ts` — replaced `matchFaq`/`FaqEntry`/Jaccard similarity entirely with `answerFaq(text, blueprint, aiProvider)`, which builds a system prompt from the blueprint (`system_prompt` + `knowledge_base` + `guardrails` + `escalation_policy` + `example_exchanges` as style-only illustrations), calls `AIProvider.chatComplete`, and parses a `{"answer": string, "escalate": boolean}` JSON response — falling back to raw text (and, if empty, the blueprint's own handoff message) if the model doesn't comply with the requested shape. `FaqGroundingBlueprint` is the new business-owned content type (mirrors the real JSON's structure, minus fields the runtime doesn't need).
- `handle-message.ts` — `agent-concierge` now takes an `aiProvider: AIProvider` input and routes FAQ questions through `answerFaq`; escalation is now something the model decides (via the `escalate` flag) rather than a confidence threshold we compute.
- **New: AI disclosure enforcement.** The blueprint's `ai_disclosure` block (`required: true`) is a compliance requirement, not a style note — the chatter must be told they're talking to an AI at the start of every new conversation. Implemented as a `withAiDisclosure` wrapper around `handleMessage` that prepends `ai_disclosure.opening_message` to the *first* response of any kind in a session (booking or FAQ) and sets `context.aiDisclosed`, so it fires exactly once per session regardless of which path answers the first message.
- Rewrote `faq-matcher.test.ts` (now tests `answerFaq`'s JSON-parsing/fallback behavior and asserts the system prompt is actually grounded in the blueprint's content) and `handle-message.test.ts`'s FAQ + new AI-disclosure scenarios against a `FakeAiProvider` in `test-support.ts` (records calls, returns a scripted or callback-driven `ChatCompleteResult`).

**Verified locally (all green):** `pnpm typecheck`, `pnpm lint`, `pnpm boundaries` (0 violations), `pnpm build`, `pnpm test` (65/65 in `agent-concierge`, up from 62 — added disclosure tests). No live network calls in any test.

**Nothing deferred to the user** — no new accounts/credentials needed; `AIProvider` is still just an interface here, real wiring is Milestone 4.

**Next:** Milestone 3 — Cook Agent Core (`agent-cook`), using the legacy implementation found at `../gracesoft-sentinel-whatsapp/packages/cook` as the extraction source.

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
  - **Superseded same day:** see the addendum entry above — real FAQ content turned out to require LLM grounding, so `agent-concierge` does now import `AIProvider`. Booking-intent parsing remains deterministic; that part of this note still stands.

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
