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
* [ ] Implement `OpenAIProvider` against `AIProvider` interface
* [ ] Run shared `AIProvider` contract test suite against it
* [ ] Move all direct OpenAI SDK calls out of `agent-concierge` / `agent-cook`
* [ ] Add config resolution (`AI_PROVIDER=openai`) in service wiring layer
* [ ] (Stretch) Stub a second provider (even a fake/mock one) to prove the interface isn't accidentally OpenAI-shaped

---

# Milestone 5 — Calendar Provider Layer (`provider-calendar-google`)

### Goal
Formalize existing Google Calendar integration behind `CalendarProvider`.

### Deliverables
* `GoogleCalendarProvider` implementing `getAvailability`, `createBooking`, `getBusinessHours`
* Correct timezone handling (Day.js, `Asia/Singapore` default, configurable per business)
* Passes shared `CalendarProvider` contract test suite

### Checklist
* [ ] Implement `GoogleCalendarProvider` against `CalendarProvider` interface
* [ ] Run shared `CalendarProvider` contract test suite against it
* [ ] Fold in timezone/business-hours fixes from Milestone 2
* [ ] Move all direct Google Calendar API calls out of `agent-concierge`

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
* [ ] Move webhook handler into `channel-whatsapp` package
* [ ] Implement `parseInbound` (text + media + booking button/list replies)
* [ ] Implement `formatOutbound`
* [ ] Run shared `ChannelAdapter` contract test suite against it
* [ ] Wire to `agent-concierge` and `agent-cook` via `core` contracts only (no reach-through)

---

# Milestone 7 — Telegram Channel (`channel-telegram`)

### Goal
Add Telegram as a second channel implementing the same `ChannelAdapter` contract — the proof that the abstraction actually holds.

### Deliverables
* Telegram Bot API webhook/long-poll receiver
* `parseInbound`: Telegram update → `NormalizedMessage`
* `formatOutbound`: `NormalizedResponse` → Telegram message format (inline keyboards for slot selection)

### Checklist
* [ ] Set up Telegram bot + webhook registration
* [ ] Implement `parseInbound`
* [ ] Implement `formatOutbound` (map WhatsApp-style quick replies → Telegram inline keyboards)
* [ ] Run shared `ChannelAdapter` contract test suite against it
* [ ] Cross-channel parity test: same scenario through WhatsApp and Telegram adapters produces equivalent `NormalizedResponse` content

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
* [ ] Build `concierge-service` composition root
* [ ] Build `cook-service` composition root
* [ ] Implement Redis-backed `ConversationState` store
* [ ] Implement Postgres logging layer
* [ ] Env validation via Zod for both services
* [ ] Local docker-compose for Redis + Postgres + both services

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
* [ ] Draft Concierge Privacy Policy (what's collected: phone number, message content, booking/calendar data; how it's used/stored/retained)
* [ ] Draft Concierge Terms & Conditions
* [ ] Draft Cook Privacy Policy (what's collected: phone number, uploaded photos, message content)
* [ ] Draft Cook Terms & Conditions
* [ ] Add effective-date/version field to each document
* [ ] Scaffold `packages/legal-concierge` and `packages/legal-cook` content packages
* [ ] Scaffold `apps/legal-site` and wire it to render both packages at their public routes
* [ ] Deploy `legal-site` to its own subdomain, independent of `concierge-service` / `cook-service`
* [ ] Submit Privacy Policy URL as part of WhatsApp Business verification/App Review for each agent
* [ ] Add Privacy Policy link to Telegram bot bio / `/start` response for each agent
* [ ] Confirm PDPA-required notice elements are present (what's collected, purpose, retention, contact for data requests)

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
* [ ] Add rate limiting middleware at service layer
* [ ] Add prompt-injection test cases + mitigations
* [ ] Add PII redaction to logging pipeline
* [ ] Add structured logging (shared logger package, not duplicated)
* [ ] Add health check / readiness endpoints
* [ ] Dockerise both services
* [ ] Deploy + smoke test in staging

---

# Milestone 11 — Future / Optional

* [ ] Multi-tenant `BusinessConfig` support (multiple businesses on one Concierge deployment)
* [ ] Mother's Day Edition: `provider-drive-google` + embeddings/RAG for personal recipe retrieval
* [ ] Additional AI provider (Anthropic/Gemini) as second `AIProvider` implementation
* [ ] Additional channel (e.g. Instagram DMs, SMS) as third `ChannelAdapter` implementation
* [ ] Voice note input handling
* [ ] Meal planning / grocery list generation (Cook)

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