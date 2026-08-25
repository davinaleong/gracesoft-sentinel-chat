# GraceSoft Sentinel Chat — Platform-Agnostic Rearchitecture

**Milestone Checklist**

This checklist covers migrating **Sentinel Concierge** (FAQ + booking) and **Sentinel Cook** (recipe discovery) from WhatsApp-only apps into isolated, platform-agnostic AI Agent packages, with separate WhatsApp/Telegram channel wrappers and a modular AI provider layer — all inside one monorepo, structured so each package could be split into its own repo with no rewiring.

Reference decisions locked in so far:
- Monorepo (pnpm workspaces), packages structured as if independent repos (own `package.json`, own `exports`, own tests, own changelog)
- No package reaches into another's internals — only through `@gracesoft-sentinel/core` contracts
- Package manager / Changesets / boundary-linting choices: **pending** (see Milestone 0)

---

# Milestone 0 — Monorepo Foundation

### Goal
Stand up the workspace scaffold and the tooling that enforces "independent repo" boundaries before any agent logic moves.

### Deliverables
* pnpm workspace root (`pnpm-workspace.yaml`)
* Shared base `tsconfig` and `eslint` config, published as their own internal packages (not root-level magic)
* Boundary-linting rule (dependency-cruiser or ESLint import-boundary plugin) wired into CI
* Changesets configured for independent per-package versioning
* Empty package skeletons created with correct naming: `core`, `agent-concierge`, `agent-cook`, `channel-whatsapp`, `channel-telegram`, `provider-ai-openai`, `provider-calendar-google`, `provider-drive-google`

### Checklist
* [x] Decide package manager (pnpm recommended) and confirm
* [x] Initialise pnpm workspace + root scripts (`build`, `test`, `lint` fan out per package)
* [x] Create `@gracesoft-sentinel/config-tsconfig` and `@gracesoft-sentinel/config-eslint` packages
* [x] Add dependency-cruiser (or equivalent) rule: packages may only import another package's `index.ts` public export, never internals
* [x] Add CI check that fails on boundary violations
* [x] Set up Changesets for independent semver per package
* [ ] (Optional) Add Turborepo/Nx for cached, graph-aware builds — skipped, revisit if build times warrant it
* [x] Scaffold empty packages with `package.json` + `exports` field for each of the 8 packages above
* [x] Confirm each empty package builds/tests in isolation (`cd packages/x && pnpm test`)

---

# Milestone 1 — Core Contracts (`@gracesoft-sentinel/core`)

### Goal
Define the channel-agnostic, provider-agnostic contracts every other package will implement or consume. This package changes the least often and everything depends on it, so it's built first and versioned carefully.

### Deliverables
* `NormalizedMessage` / `NormalizedResponse` types (text, media, sender id, timestamp, channel, raw payload passthrough)
* `ChannelAdapter` interface (`parseInbound`, `formatOutbound`)
* `AIProvider` interface (`chatComplete`, `visionAnalyze`, `embed`)
* `CalendarProvider` interface (`getAvailability`, `createBooking`, `getBusinessHours`)
* `RecipeSourceProvider` interface (for Mother's Day Edition, future)
* `ConversationState` / session contract (channel-agnostic shape for Redis-backed state)
* `BusinessConfig` contract (FAQ blueprint path, office hours, timezone, calendar id — one config shape both agents can consume)

### Checklist
* [x] Define and document `NormalizedMessage` / `NormalizedResponse`
* [x] Define `ChannelAdapter` interface + shared contract test suite (any implementation must pass it)
* [x] Define `AIProvider` interface + shared contract test suite
* [x] Define `CalendarProvider` interface + shared contract test suite
* [x] Define `ConversationState` contract (used by Redis session store)
* [x] Define `BusinessConfig` contract
* [x] Zod schemas for all of the above (runtime validation, not just compile-time types)
* [x] Publish package internally, tag `v0.1.0` via Changesets — no npm registry configured yet (private monorepo), so interpreted as: CHANGELOG cut + git tag `@gracesoft-sentinel/core@0.1.0`

---

# Milestone 2 — Concierge Agent Core (`agent-concierge`)

### Goal
Extract FAQ + booking logic into a pure, platform-agnostic package that depends only on `core` interfaces — no WhatsApp, no OpenAI SDK, no direct Google Calendar calls inside.

### Deliverables
* FAQ matcher (blueprint lookup + confidence scoring + escalation trigger)
* Booking intent detection and the three date/time scenarios (no date/time, date only, time only in/out of office hours)
* Slot recommendation engine (next 3 available slots, business-day/office-hours aware, correct rollover to next business day)
* Business-hours map fix (resolves the `testing.md` bug: 2 May excluded correctly, rollover lands on 4 May)
* `handleMessage()` entry point consuming `NormalizedMessage` + `ConversationState`, returning `NormalizedResponse`

### Checklist
* [x] Extract FAQ matcher out of current WhatsApp-coupled code
* [x] Extract booking state machine + slot engine
* [x] Fix business-hours/timezone bug as part of extraction (write regression test first, see test checklist)
* [x] Wire agent to `AIProvider` and `CalendarProvider` interfaces only (no concrete SDK imports)
* [x] Implement `handleMessage()` public entry point
* [x] Confirm zero imports from `channel-*` or `provider-*` packages (boundary lint passes)
* [x] Unit test suite runnable with zero network calls (mock providers)

---

# Milestone 3 — Cook Agent Core (`agent-cook`)

### Goal
Extract dish-recognition-to-recipe logic into the same pure-package shape as Concierge.

### Deliverables
* Dish classification flow (image → `AIProvider.visionAnalyze` → dish name)
* Ingredient/recipe generation flow (dish name → `AIProvider.chatComplete` → structured recipe)
* Substitution + serving-suggestion logic
* `handleMessage()` entry point (image or text input)

### Checklist
* [x] Extract dish recognition logic out of current WhatsApp-coupled code
* [x] Extract recipe generation + formatting logic
* [x] Wire agent to `AIProvider` interface only
* [x] Implement `handleMessage()` public entry point
* [x] Confirm zero imports from `channel-*` or `provider-*` packages
* [x] Unit test suite runnable with zero network calls (mock `AIProvider`)

---

# Milestone 4 — AI Provider Layer (`provider-ai-openai`)

### Goal
Wrap the existing OpenAI usage behind the `AIProvider` interface so either agent can consume it without knowing it's OpenAI.

### Deliverables
* `OpenAIProvider` implementing `chatComplete`, `visionAnalyze`, `embed`
* Config-driven provider selection (env var, resolved at service wiring, not inside agent code)
* Passes the `AIProvider` shared contract test suite from Milestone 1

### Checklist
* [x] Implement `OpenAIProvider` against `AIProvider` interface
* [x] Run shared `AIProvider` contract test suite against it
* [x] Move all direct OpenAI SDK calls out of `agent-concierge` / `agent-cook`
* [x] Add config resolution (`AI_PROVIDER=openai`) in service wiring layer — see progress log for scope note (only one real provider exists, so this is `createOpenAIProviderFromEnv()`; full multi-provider branching lands with Milestone 8's composition root)
* [x] (Stretch) Stub a second provider (even a fake/mock one) to prove the interface isn't accidentally OpenAI-shaped

---

# Milestone 5 — Calendar Provider Layer (`provider-calendar-google`)

### Goal
Formalize existing Google Calendar integration behind `CalendarProvider`.

### Deliverables
* `GoogleCalendarProvider` implementing `getAvailability`, `createBooking`, `getBusinessHours`
* Correct timezone handling (Day.js, `Asia/Singapore` default, configurable per business)
* Passes shared `CalendarProvider` contract test suite

### Checklist
* [x] Implement `GoogleCalendarProvider` against `CalendarProvider` interface
* [x] Run shared `CalendarProvider` contract test suite against it
* [x] Fold in timezone/business-hours fixes from Milestone 2
* [x] Move all direct Google Calendar API calls out of `agent-concierge`

---

# Milestone 6 — WhatsApp Channel (`channel-whatsapp`)

### Goal
Refactor the existing WhatsApp webhook integration into a `ChannelAdapter` implementation.

### Deliverables
* Webhook receiver + verification
* `parseInbound`: WhatsApp payload → `NormalizedMessage`
* `formatOutbound`: `NormalizedResponse` → WhatsApp message/template format
* Media download handling (images for Cook)

### Checklist
* [x] Move webhook handler into `channel-whatsapp` package
* [x] Implement `parseInbound` (text + media + booking button/list replies)
* [x] Implement `formatOutbound`
* [x] Run shared `ChannelAdapter` contract test suite against it
* [x] Wire to `agent-concierge` and `agent-cook` via `core` contracts only (no reach-through) — see progress log: the webhook router takes an injected `onMessage` callback rather than importing either agent, so the actual wiring happens at Milestone 8's service composition

---

# Milestone 7 — Telegram Channel (`channel-telegram`)

### Goal
Add Telegram as a second channel implementing the same `ChannelAdapter` contract — the proof that the abstraction actually holds.

### Deliverables
* Telegram Bot API webhook/long-poll receiver
* `parseInbound`: Telegram update → `NormalizedMessage`
* `formatOutbound`: `NormalizedResponse` → Telegram message format (inline keyboards for slot selection)

### Checklist
* [x] Set up Telegram bot + webhook registration — `TelegramApiClient.setWebhook()`; actual bot creation via BotFather is a manual step for whoever deploys (Milestone 8/10), not something buildable in-repo
* [x] Implement `parseInbound`
* [x] Implement `formatOutbound` (map WhatsApp-style quick replies → Telegram inline keyboards)
* [x] Run shared `ChannelAdapter` contract test suite against it
* [x] Cross-channel parity test: same scenario through WhatsApp and Telegram adapters produces equivalent `NormalizedResponse` content — `tests/cross-channel-parity.test.ts` at the repo root (see progress log for why it lives outside `packages/`)

---

# Milestone 8 — Service Wiring (`apps/concierge-service`, `apps/cook-service`)

### Goal
Compose agent + channel(s) + provider(s) into deployable services, config-driven per deployment.

### Deliverables
* `concierge-service`: wires `agent-concierge` to `channel-whatsapp` + `channel-telegram` + `provider-ai-openai` + `provider-calendar-google`
* `cook-service`: wires `agent-cook` to `channel-whatsapp` + `channel-telegram` + `provider-ai-openai`
* Env-driven config resolution (which channels enabled, which provider, per-business config path)
* Redis session store implementation of `ConversationState`
* Postgres logging/persistence

### Checklist
* [x] Build `concierge-service` composition root
* [x] Build `cook-service` composition root
* [x] Implement Redis-backed `ConversationState` store
* [x] Implement Postgres logging layer
* [x] Env validation via Zod for both services
* [x] Local docker-compose for Redis + Postgres + both services

---

# Milestone 9 — Legal & Compliance Pages

### Goal
Give each agent (Concierge, Cook) its own publicly reachable Privacy Policy and Terms & Conditions — required for WhatsApp Business verification/App Review, good practice for Telegram, and PDPA notice obligations given the business operates from Singapore. Content is decoupled from serving, same boundary discipline as the rest of the monorepo.

### Deliverables
* `packages/legal-concierge` — Privacy Policy + T&C content (markdown/MDX) with effective date / version
* `packages/legal-cook` — Privacy Policy + T&C content (markdown/MDX) with effective date / version
* `apps/legal-site` — thin static site rendering both packages' content at public routes (`/concierge/privacy`, `/concierge/terms`, `/cook/privacy`, `/cook/terms`), deployable independently of the two service apps
* WhatsApp Business verification submission using the live Privacy Policy URL
* Telegram bot bio/`/start` message linking to the relevant policy pages

### Checklist
* [x] Draft Concierge Privacy Policy (what's collected: phone number, message content, booking/calendar data; how it's used/stored/retained)
* [x] Draft Concierge Terms & Conditions
* [x] Draft Cook Privacy Policy (what's collected: phone number, uploaded photos, message content)
* [x] Draft Cook Terms & Conditions
* [x] Add effective-date/version field to each document
* [x] Scaffold `packages/legal-concierge` and `packages/legal-cook` content packages
* [x] Scaffold `apps/legal-site` and wire it to render both packages at their public routes
* [ ] Deploy `legal-site` to its own subdomain, independent of `concierge-service` / `cook-service` — `Dockerfile` + `docker-compose.yml` entry exist and are structurally correct (no dependency on the other two services' containers), but an actual live subdomain deploy needs hosting the user provides
* [ ] Submit Privacy Policy URL as part of WhatsApp Business verification/App Review for each agent — blocked on a live deploy + a real WhatsApp Business account; needs the user
* [ ] Add Privacy Policy link to Telegram bot bio / `/start` response for each agent — blocked on a live deploy + a real Telegram bot; needs the user
* [x] Confirm PDPA-required notice elements are present (what's collected, purpose, retention, contact for data requests) — automated keyword checks in `legal-content.test.ts`; full legal sufficiency still needs human review (content is explicitly marked DRAFT)

---

# Milestone 10 — Hardening & Production Readiness

### Goal
Carry forward the reliability work already validated in the original plan, now applied at the service-wiring layer so it's shared infra rather than duplicated per agent.

### Deliverables
* Rate limiting
* Prompt injection safeguards
* PII redaction in logs
* Structured, traceable logging
* Startup resilience / health checks
* Deployment (Docker, chosen host)

### Checklist
* [x] Add rate limiting middleware at service layer
* [x] Add prompt-injection test cases + mitigations
* [x] Add PII redaction to logging pipeline
* [x] Add structured logging (shared logger package, not duplicated)
* [x] Add health check / readiness endpoints (already done in Milestone 8)
* [x] Dockerise both services (already done in Milestone 8, `legal-site` also has one from Milestone 9)
* [ ] Deploy + smoke test in staging — blocked: needs real hosting + OpenAI/Google/WhatsApp/Telegram credentials this environment doesn't have

---

# Milestone 11 — Future / Optional

* [x] Multi-tenant `BusinessConfig` support (multiple businesses on one Concierge deployment) — new `NormalizedMessage.businessChannelId` (WhatsApp `phone_number_id` / Twilio `To`, populated by those two adapters; unset for Telegram, whose bot identity lives in its webhook URL, not the payload) lets `concierge-service` resolve which business an inbound message belongs to; `BUSINESS_CONFIGS_DIR` (a directory of `<businessChannelId>.json` files) is a new alternative to the single-tenant `BUSINESS_CONFIG_PATH`, and session ids are now tenant-scoped so the same customer messaging two businesses can't collide onto one conversation state
* [x] Mother's Day Edition: embeddings/RAG for personal recipe retrieval — originally `provider-drive-google`'s `GoogleDriveRecipeProvider implements RecipeSourceProvider` (in-memory index rebuilt from a Drive folder on first use per process); refactored to `provider-recipe-pinecone`'s `PineconeRecipeProvider` querying a persistent Pinecone index instead, with `provider-drive-google` trimmed down to pure Drive I/O (`listRecipeDocuments`) feeding a separate `syncDriveRecipesToPinecone` ingestion job (run out-of-band, not inline in the request path — see `sync-cli.ts`). Query-time retrieval no longer lists/downloads/re-embeds a Drive folder on every lookup, and scales across multiple service replicas without each holding its own duplicate in-memory index. Wired into `agent-cook` as the same opt-in `recipeSourceProvider` param as before — the interface didn't change, only which concrete provider `cook-service`/`demo-service` construct (`PINECONE_INDEX_NAME` instead of `GOOGLE_DRIVE_RECIPES_FOLDER_ID`)
* [x] Additional AI provider (Anthropic/Gemini) as second `AIProvider` implementation — went with Gemini over Anthropic: Anthropic has no native embeddings API, and `embed` is part of the `AIProvider` contract every implementation must satisfy
* [x] Additional channel (e.g. Instagram DMs, SMS) as third `ChannelAdapter` implementation — went with SMS via Twilio: simpler/better-documented webhook model than Instagram's Graph API, and it proves the abstraction against a channel with genuinely *less* capability (plain text only, no interactive UI)
* [x] Voice note input handling — `AIProvider.transcribeAudio` (new core capability, implemented in both `provider-ai-openai` via Whisper and `provider-ai-gemini`), wired into both `agent-concierge` and `agent-cook`; no channel-layer changes needed since `NormalizedMedia`'s `"audio"` type already existed from Milestone 1
* [x] Meal planning / grocery list generation (Cook) — `CookContext.recentRecipes` (last 7, a week's worth) accumulates across a session; a "grocery list"/"meal plan" request consolidates their ingredients via `AIProvider.chatComplete` (real quantity merging — "2 cloves garlic" + "2 cloves garlic" → "4 cloves garlic" — needs an LLM, not string dedup)
* [x] Free recipe search by dish name (Cook) — "recipe for chicken noodle soup" / "how do I make X" (deterministic pattern match, `recipe-search.ts`, no possessive word — distinct from the Mother's Day Edition's personal-source lookup) generates a generic recipe via `generateRecipe({dishName, homeStyle: true})`, the same generation the photo path uses, minus the photo. Needs no `recipeSourceProvider` configured at all — it's a core Cook capability, not Milestone-11 opt-in. Checked after the personal-recipe request in `handleMessage`'s dispatch, so possessive phrasing ("my mom's recipe for X") still prefers a configured personal source over the generic fallback

---

# Milestone 12 — Chatter-Facing Timezone Labeling

### Goal
Remove the ambiguity in every time a chatter sees. Times are already computed correctly in the business's configured timezone (dayjs + IANA tz data, DST-aware for free) — the gap is that nothing ever tells the chatter *which* timezone that is, which only matters once a chatter might not be assumed to share it.

### Deliverables
* `formatSlotLabel` (and any other chatter-facing date/time formatting) appends an explicit business-timezone label, e.g. `"Tue, 5 May, 9:00am (Singapore time)"` instead of the current bare `"Tue, 5 May, 9:00am"`
* Every message that shows a specific date/time to a chatter carries the label — slot offers, booking confirmations, reschedule confirmations, cancellation confirmations
* Deliberately *not* in scope: detecting or converting to the chatter's own timezone (unreliable — neither WhatsApp nor Telegram webhook payloads carry it) or multi-location/multi-timezone businesses (a bigger `BusinessConfig` redesign, not this milestone)

### Checklist
* [ ] Add a business-timezone label to `formatSlotLabel`'s output
* [ ] Audit `agent-concierge` for any other chatter-facing date/time formatting call sites and apply the same label
* [ ] Regression test: slot-offer, booking-confirmation, reschedule-confirmation, and cancellation-confirmation messages all include the timezone label

---

# Milestone 13 — No-Code Setup CLI (`setup-cli`)

### Goal
Replace hand-authored `BusinessConfig`/`businessHours`/FAQ-blueprint JSON files with a guided CLI wizard, so onboarding a new business doesn't require understanding the underlying schema shapes or manually typing ~25 public-holiday date entries. Scoped as low-code for whoever runs it (not a self-serve web form for the business owner directly) — see progress log for why a web admin panel is deliberately deferred until this proves the underlying data model.

### Deliverables
* New `@gracesoft-sentinel/setup-cli` package — depends only on `core` (reuses its Zod schemas for live validation), zero imports from `agent-*`/`channel-*`/`provider-*`
* Interactive wizard: business identity, timezone, calendar id, weekly business hours — validated live against `core`'s `BusinessConfigSchema`/`BusinessHoursSchema`, re-prompting on invalid input rather than writing a broken file
* Bundled per-country public-holiday dataset (e.g. `date-holidays`) pre-fills `businessHours.exceptions` for the owner to review/trim, instead of manual date entry
* Interactive wizard: guided FAQ-blueprint builder (business description/tone, Q&A knowledge-base entries, guardrails, escalation contact) assembling the `FaqGroundingBlueprint` JSON shape behind the scenes — the owner never edits that structure directly
* Output written directly to the same file location(s) `concierge-service`/`cook-service` already load from (`BUSINESS_CONFIG_PATH` for single-tenant, or a new `<businessChannelId>.json` inside `BUSINESS_CONFIGS_DIR` for multi-tenant) — no changes needed elsewhere in the stack
* Holidays stay a static list *in* the generated config (offline-reliable, versioned in git) — the bundled dataset is a setup-time convenience only, never a runtime dependency

### Checklist
* [ ] Scaffold `@gracesoft-sentinel/setup-cli` package
* [ ] Business-hours + holiday wizard, validated against `core`'s schemas
* [ ] Bundled holiday dataset integration for exception pre-fill
* [ ] FAQ-blueprint wizard, assembling the full `FaqGroundingBlueprint` shape
* [ ] Writes to `BUSINESS_CONFIG_PATH`-shaped single file, or a new file inside a `BUSINESS_CONFIGS_DIR`-shaped directory
* [ ] Confirm zero imports from `agent-*`/`channel-*`/`provider-*` packages (boundary lint)

---

# Milestone 14 — Multi-Agent Demo (`agent-switcher`, `demo-service`)

### Goal
Let one chat window demo both Concierge and Cook — useful for live demos and sales conversations where standing up two separate verified numbers per audience isn't practical. Explicitly a demo tool, not a production multi-agent platform: `agent-concierge` and `agent-cook` remain fully unaware of each other, same boundary discipline as everywhere else in this monorepo.

### Deliverables
* `@gracesoft-sentinel/agent-switcher` — wraps N independently-composed agents (each an already self-contained `onMessage` callback) behind one `onMessage`, switching which is active per chatter via an exact-match command (`/concierge`, `/cook`) or bare passphrase (`concierge`, `cook`)
* `apps/demo-service` — single-tenant composition root wiring `agent-concierge` (OpenAI + Google Calendar) and `agent-cook` (OpenAI) side by side behind the switcher, one shared Redis-backed `SessionStore`/rate limiter, Postgres logging tagged with the correct agent name per turn
* Each agent's own conversation state survives independently across switches — a booking in progress on Concierge isn't disturbed by a detour to Cook and back
* `docker-compose.yml` entry (port 3003), `.env.example` documenting that this needs its own dedicated bot/number distinct from the standalone services
* `@gracesoft-sentinel/legal-demo` — Privacy Policy + T&C covering both halves it demos, served by `apps/legal-site` at `/demo/privacy`/`/demo/terms`, same structure as `legal-concierge`/`legal-cook`

### Checklist
* [x] Scaffold `@gracesoft-sentinel/agent-switcher` package
* [x] Switch-vs-forward core logic, with per-chatter independence and stale-active-agent fallback
* [x] Scaffold `apps/demo-service`, wiring both agents through the switcher
* [x] Local Docker smoke test: container builds, `/health`/`/ready` green against real Redis/Postgres, a synthetic Telegram update correctly triggers a switch
* [x] Confirm zero imports between `agent-concierge`/`agent-cook`, and zero cross-app imports from `apps/concierge-service`/`apps/cook-service` (boundary lint)
* [x] Draft `@gracesoft-sentinel/legal-demo` Privacy Policy + T&C, wired into `apps/legal-site`
* [ ] Set up a dedicated demo Google Calendar (rather than reusing the real business calendar) — open question, not yet decided
* [ ] Create a dedicated Telegram bot (and/or WhatsApp number) for the demo — needed before this can actually be used live

---

# Suggested Build Order

1. Milestone 0 — Monorepo foundation
2. Milestone 1 — Core contracts
3. Milestone 2 & 3 (parallel) — Agent cores
4. Milestone 4 & 5 (parallel) — Provider adapters
5. Milestone 6 — WhatsApp channel (prove one channel end-to-end)
6. Milestone 7 — Telegram channel (prove the abstraction with a second channel)
7. Milestone 8 — Service wiring
8. Milestone 9 — Legal & compliance pages (needed before any real WhatsApp Business verification/App Review submission)
9. Milestone 10 — Hardening
10. Milestone 11 — Future work
11. Milestone 12 — Chatter-facing timezone labeling
12. Milestone 13 — No-code setup CLI
13. Milestone 14 — Multi-agent demo (agent-switcher, demo-service)