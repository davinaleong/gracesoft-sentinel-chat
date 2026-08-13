# Progress Log

Companion to `01-milestone-checklist.md`. One entry per work session, newest first. Records what was actually built, decisions made, and anything deferred that needs a human (accounts, credentials, deployment).

---

## 2026-08-13 — Milestone 9 (partial): Legal & Compliance content packages

**Status:** Partial — content and packages done, `apps/legal-site` (the serving layer) not started, and everything requiring a live deployment or a real account is necessarily out of reach here. Stopped mid-milestone at the user's request to document and commit before continuing.

**What was built:**
- `packages/legal-concierge` and `packages/legal-cook` — each has `content/privacy-policy.md` + `content/terms.md` (real markdown, not placeholder lorem ipsum) and `src/legal-content.ts` (`loadPrivacyPolicy()`/`loadTerms()`), which parses effective date and version **out of the markdown itself** (`**Effective date:**`/`**Version:**` lines) rather than duplicating them as separate constants — so the rendered metadata can't drift from the document's own header.
- Content covers what Milestone 1's test-checklist §5 PDPA section asks for: what's collected (phone/chat id, message text, booking data for Concierge; phone/chat id, message text, **photos** for Cook), purpose, retention, and a contact method (`hello@gracesoft.dev` / `gracesoft.dev/contact` — both real, sourced from the FAQ blueprint already in `_internal-docs/data/`). Concierge's policy explicitly documents the AI-disclosure behavior already implemented in `agent-concierge/handle-message.ts`; Cook's explicitly states photos are processed and discarded, never stored — which matches what `channel-whatsapp`/`channel-telegram`'s media handling actually does (inlined as a `data:` URI in-memory, never written to Postgres — only a `[photo]` placeholder is logged).
- **Every content file is marked as a DRAFT** (an HTML comment at the top of each `.md`, plus called out here): this is scaffolding — real, usable content, but not something to submit to WhatsApp Business verification or treat as the business's binding legal terms without a qualified-counsel review first. I'm not a lawyer and won't represent AI-drafted policy text as legally sufficient on its own.
- `legal-content.test.ts` in each package: automated keyword-presence checks for the PDPA notice elements (data collected, purpose, retention, contact) plus effective-date/version parsing. This satisfies the *automatable* part of test-checklist §5's PDPA section; the section's own heading calls the full check "manual review, not automatable," which still stands.

**Verified locally (all green):** `pnpm lint`, `pnpm typecheck`, `pnpm boundaries`, `pnpm test` (16 new tests, 272 total workspace-wide), `pnpm build`.

**What's NOT done, and why:**
- `apps/legal-site` — the thin Express app that would actually serve these at `/concierge/privacy` etc. — was not started. This is genuinely still buildable without external accounts (same pattern as `concierge-service`/`cook-service`'s `server.ts`), just not reached yet.
- Deploying `legal-site` to a subdomain, submitting the URL to WhatsApp Business verification, and linking it from a Telegram bot's bio all require things I don't have: a live hosting target, a real WhatsApp Business account, and a real Telegram bot. These are flagged in the milestone checklist as needing the user.

**Deferred to the user:**
- Qualified legal review of the drafted Privacy Policy/T&C content before it's used for real (see the DRAFT markers).
- Everything listed under "what's NOT done" above.

**Next:** finish Milestone 9 (`apps/legal-site`), then Milestone 10 — Hardening & Production Readiness.

---

## 2026-08-13 — Milestone 8: Service Wiring (`concierge-service`, `cook-service`)

**Status:** Complete (docker-compose is structurally correct but not run end-to-end — see below).

**New packages, beyond the two apps:**
- **`@gracesoft-sentinel/core` gained a `SessionStore` interface** (+ `runSessionStoreContractTests`), mirroring `CalendarProvider`/`AIProvider` — `ConversationState` (the data shape) existed since Milestone 1, but nothing defined the swappable persistence interface around it. Went through the real Changesets flow this time (`.changeset/session-store-contract.md` → `pnpm changeset version`): core bumped `0.1.0` → `0.2.0` (minor), dependents patch-bumped automatically.
- **`provider-session-redis`** — `RedisSessionStore implements SessionStore`, wrapping `ioredis` behind a minimal `RedisLikeClient` interface (same pattern as `provider-calendar-google`'s `GoogleCalendarClient`) so the contract suite runs against an in-memory fake, no real Redis needed.
- **`logging-postgres`** — `ConversationLogger` (business-owned interface, not a `core` contract — logging is a service-layer concern the composition root performs around `handleMessage`, not something either agent takes as an input), `PostgresConversationLogger` implementing it via `pg`, plus `schema.sql` (two tables: `conversation_messages`, `bookings`). Deliberately logs `text`/`sessionId`/`channel`/`agent` only — never a channel's raw payload — so it's not storing more than the policy needs by construction; full PII redaction *within* logged text is Milestone 10's job.

Both new packages follow the `createXFromEnv()` construction pattern established in Milestones 4/5.

**The two composition roots (`apps/concierge-service`, `apps/cook-service`):** each has `env.ts` (Zod, fails fast with every invalid/missing var listed at once, not just the first), `on-message.ts` (the actual composition — session load/save, message logging, calls `handleMessage`, exported as a standalone factory so it's testable against fakes without a running server), `server.ts` (health/readiness + conditionally-mounted WhatsApp/Telegram routers), `composition.ts` (wires real providers from env), `index.ts` (entrypoint). `concierge-service` additionally has `business-config-loader.ts` (loads+validates a `BusinessConfig` JSON file via `BusinessConfigSchema.parse`, then the FAQ blueprint relative to it) and `logging-calendar-provider.ts` (`withBookingLogging`, a `CalendarProvider` decorator that logs a booking record after a successful `createBooking` — a decorator rather than baking logging into `GoogleCalendarProvider` itself, since booking records need the session id, which only the composition layer has in scope).

**Real data put to use:** built `_internal-docs/data/business-config.example.json` from the actual GraceSoft FAQ blueprint and the real 2026+2027 Singapore public-holiday CSVs already sitting in that folder (26 dated exceptions, transcribed by hand from the CSVs — business hours themselves are a placeholder Mon-Fri 9-6 SGT since GraceSoft's real hours aren't published anywhere, per the FAQ blueprint's own `contact.business_hours` field). `composition.test.ts` loads this real file through the real loader and schema — proving it's genuinely valid, not just hand-typed and hoped-for.

**Two bugs found and fixed along the way:**
1. **Silent booking failures.** Writing the "Calendar API auth failure → graceful error handling" test (test-checklist §3) surfaced that `confirmBooking` in `agent-concierge/handle-message.ts` had no error handling around `calendarProvider.createBooking` at all — a failure would throw, propagate up through the service's `onMessage`, and since the channel webhook layer already sent its ack before processing, the chatter would get **no reply whatsoever**, not even an apology. Fixed by catching the error and returning "couldn't complete that booking, please try again" — logged in the test-checklist regression table.
2. **A pre-existing, unrelated ESLint config bug.** `pnpm lint` failed on `channel-telegram`'s (and, on closer look, every package's) built `dist/**` output — the shared config's ignore patterns (`"dist/**"` etc.) only reliably excluded paths relative to the config file's own directory, not the cwd `eslint .` actually runs from per-package. Silent in CI (lint runs before build there) but broke local dev workflows where build happens first. Fixed by switching to `"**/dist/**"` etc. in `packages/config-eslint/index.js`.

**Boundary rules extended to `apps/`:** `.dependency-cruiser.cjs` gained `no-channel-to-channel` (mirrors the existing cross-package-internals rule's structure — a same-package exclusion needs *both* the negative-lookahead in `to.path` *and* a matching `to.pathNot`, empirically; lookahead-only or pathNot-only each independently failed to exclude same-package edges) and `no-app-to-app`/`no-package-imports-app`. `boundaries` script scope extended from `packages` to `packages apps`. Both webhook routers (`channel-whatsapp`, `channel-telegram`) take `onMessage` as an injected callback rather than either app importing `agent-concierge`/`agent-cook` — composition happens entirely in each app's own `on-message.ts`/`composition.ts`, so `channel-*` and `agent-*` packages remain exactly as agent/channel-agnostic as they were before this milestone.

**`docker-compose.yml`** — Redis + Postgres (with `schema.sql` mounted as init SQL) + both services, each built from its own `Dockerfile` (simple whole-workspace build, not yet size-optimized via `pnpm deploy`/multi-stage pruning — that's a Milestone 10 concern). **Not run end-to-end in this environment** — doing so needs real OpenAI/Google service-account credentials and either a WhatsApp Business or Telegram bot token, none of which exist here. What *is* verified: both Dockerfiles are structurally sound (same build shape already proven to typecheck/build via `pnpm build`), `docker-compose.yml` references real files (`schema.sql`, `.env.example`s) that exist, and every piece it wires together (`composition.ts` for both apps) is proven to construct cleanly via `composition.test.ts`.

**Verified locally (all green):** `pnpm lint`, `pnpm typecheck`, `pnpm boundaries` (0 violations, 334 modules/692 dependencies), `pnpm test` (254/254 across the whole workspace), `pnpm build`, plus the root `test:integration`/`typecheck:integration`/`lint:integration` (3/3).

**Deferred to the user:**
- Real OpenAI API key, Google Cloud service-account credentials, and a WhatsApp Business or Telegram bot (or both) to actually run `docker-compose up` end-to-end.
- `calendarId` in `business-config.example.json` is a placeholder (`REPLACE_WITH_REAL_GOOGLE_CALENDAR_ID`) — needs a real Google Calendar ID once one exists for the business.
- The security flag from Milestone 5 (leaked GCP service-account key in the legacy repo) is still outstanding.

**Next:** Milestone 9 — Legal & Compliance Pages.

---

## 2026-08-13 — Milestone 7: Telegram Channel (`channel-telegram`)

**Status:** Complete.

**Extraction source:** `../gracesoft-sentinel-whatsapp/packages/gateway-telegram` + `packages/telegram-client`. Smaller in scope than the WhatsApp equivalent and with the same gap: legacy never implemented `callback_query`/inline-keyboard handling anywhere — no evidence it was ever wired up in either package. So, as with WhatsApp, the interactive-reply support here is new capability built against `NormalizedResponse.quickReplies`, not a port of existing behavior.

**What was built (deliberately mirrors `channel-whatsapp`'s shape for the two packages to read as obviously-parallel implementations of one contract):**
- `telegram-adapter.ts` — `TelegramChannelAdapter implements ChannelAdapter`. `parseInbound` handles text, the largest photo size (Telegram sends multiple resolutions; legacy already picked the last/largest one, kept that), and — new — `callback_query` (→ `quickReplyId` from `callback_data`). `formatOutbound` renders `quickReplies` as a Telegram inline keyboard, one button per row via `reply_markup.inline_keyboard`. Unlike WhatsApp's hard 3-button cap forcing a list-vs-buttons branch, Telegram's inline keyboards don't have that constraint, so there's a single code path regardless of option count.
- **Same media-security consideration as WhatsApp, different mechanism:** Telegram file URLs embed the bot token directly in the URL path (`.../file/bot<token>/<path>`), so unlike WhatsApp's URLs they're technically fetchable without a header — but handing that URL to a third-party `AIProvider` would leak the bot token to whatever server fetches it. `TelegramApiClient.downloadFileAsDataUri()` downloads and inlines as a `data:` URI for the same reason as `WhatsAppApiClient.downloadMediaAsDataUri()`, keeping the security posture consistent across channels rather than accidentally weaker on the "convenient" one.
- `secret-token.ts` — `verifyTelegramSecretToken()`: unlike WhatsApp's HMAC-over-body signature, Telegram's webhook auth is a static shared-secret header (`X-Telegram-Bot-Api-Secret-Token`) set once via `setWebhook`'s `secret_token` param — simple `timingSafeEqual` string comparison, no HMAC needed.
- `webhook-router.ts` — POST-only (Telegram has no GET handshake like Meta's `hub.challenge` — registration is a one-time API call, see below), same ack-then-process-async pattern and injected-`onMessage` design as `channel-whatsapp`'s router, for the same reason (agent wiring is Milestone 8's job).
- `telegram-api-client.ts` — adds `setWebhook(url, secretToken)` (satisfies the "Set up Telegram bot + webhook registration" checklist item — the actual bot creation via @BotFather is an unavoidable manual/human step, not something this repo can do for the user) alongside `sendMessage`/`downloadFileAsDataUri`.

**Cross-channel parity test — the actual point of this milestone:** added `tests/cross-channel-parity.test.ts` at the **repo root**, not inside `packages/`. Reason: `agent-concierge`, `channel-whatsapp`, and `channel-telegram` are each independently forbidden (by design and by the boundary-lint rule) from importing one another, but proving parity requires exactly that — driving the same scenario through both adapters and the same agent in one test. Added a `tests/` directory with its own `tsconfig.json`, plus root `test:integration`/`typecheck:integration`/`lint:integration` scripts (kept separate from the existing `pnpm test`/`typecheck`/`lint` fan-outs, which only touch `packages/*`), wired into `ci.yml` after the `build` step since these tests import built `dist/` output, not source. The test proves: (1) equivalent inbound text extracted from each channel's own wire format, (2) the same booking scenario run through `agent-concierge.handleMessage` produces byte-identical response text/quick-replies regardless of originating channel, (3) each adapter renders that shared response correctly in its own envelope (WhatsApp interactive buttons vs. Telegram inline keyboard) with matching ids/labels.

**Verified locally (all green):** `pnpm typecheck`, `pnpm lint`, `pnpm boundaries` (0 violations), `pnpm build`, `pnpm test` — 25/25 new tests in `channel-telegram`, 175/175 workspace-wide across `packages/`, plus `pnpm typecheck:integration`/`lint:integration`/`test:integration` (3/3) for the root-level parity test. Zero live network calls anywhere.

**Nothing deferred to the user for this milestone** beyond the inherent human step of registering a real bot with @BotFather — not something buildable in advance of an actual deployment (Milestone 8/10).

**Next:** Milestone 8 — Service Wiring (`apps/concierge-service`, `apps/cook-service`).

---

## 2026-08-13 — Milestone 6: WhatsApp Channel (`channel-whatsapp`)

**Status:** Complete.

**Extraction source:** `../gracesoft-sentinel-whatsapp/packages/gateway-whatsapp` (Express webhook router) and `packages/whatsapp-client` (axios-based Graph API calls, inbound normalization, HMAC verification). Notable finding: legacy **never used WhatsApp's real interactive button/list messages** — the "3 slot options" were plain numbered text ("Reply with the number of your preferred slot"), and `normalize.ts` had dead types for `interactive`/`button` message types that nothing ever produced or consumed. Milestone 2's `agent-concierge` already emits proper `NormalizedResponse.quickReplies`, so this was an opportunity to actually wire that through to WhatsApp's real interactive messages rather than porting the numbered-text workaround.

**What was built:**
- `whatsapp-adapter.ts` — `WhatsAppChannelAdapter implements ChannelAdapter`. `formatOutbound` renders `quickReplies` as native WhatsApp interactive **reply buttons** (≤3 options — which happens to be exactly `agent-concierge`'s `DEFAULT_SLOT_COUNT`) or an interactive **list** (4-10 options), with defensive truncation to WhatsApp's actual button (20 char) / list-row (24 char) title limits. `parseInbound` handles text, `button_reply`/`list_reply` interactive replies (→ `quickReplyId`), and media messages.
- **Media handling gap found and resolved:** WhatsApp Cloud API media URLs require an `Authorization` header and expire in minutes — handing one straight to `AIProvider.visionAnalyze({image:{url}})` (as Milestone 3's `agent-cook` does) wouldn't work, since that URL isn't fetchable by an external AI provider. `WhatsAppApiClient.downloadMediaAsDataUri()` downloads the bytes server-side (authenticated) and inlines them as a `data:` URI instead of a bare link — no `core` schema change needed, since `NormalizedMedia.url` is just a string and both `AIProvider.visionAnalyze` and OpenAI's own content-part format accept `data:` URIs transparently.
- `signature.ts` — `verifyWhatsAppSignature()`, HMAC-SHA256 over the raw body via `X-Hub-Signature-256`, `timingSafeEqual` comparison (ported from legacy's `verify.ts`, same algorithm).
- `webhook-verification.ts` — `handleVerificationRequest()`, the GET `hub.mode`/`hub.challenge`/`hub.verify_token` handshake, extracted as a pure function separate from the Express route so it's unit-testable without a server.
- `webhook-router.ts` — `createWhatsAppWebhookRouter()`: GET handshake, POST signature check (raw body via `express.raw()`), acks 200 immediately then processes async (matches legacy's fast-ack-then-process pattern — Meta retries if you don't respond quickly). **Takes `onMessage` as an injected callback rather than importing `agent-concierge`/`agent-cook` directly** — composing a channel with an agent is Milestone 8's job (the service-wiring composition root), not something a channel package should hardcode. This also means `channel-whatsapp` has zero imports from either agent package, trivially satisfying that boundary without needing a dependency-cruiser rule for it.
- `whatsapp-api-client.ts` — thin `fetch`-based wrapper over the Graph API (`sendMessage`, `downloadMediaAsDataUri`); no `axios` dependency, unlike legacy — consistent with `provider-ai-openai`'s approach of using an injectable `fetch` for testability without live network calls.

**Verified locally (all green):** `pnpm typecheck`, `pnpm lint`, `pnpm boundaries` (0 violations), `pnpm build`, `pnpm test` — 33/33 new tests in `channel-whatsapp` (including a real end-to-end webhook integration test: spins up an actual `http` server, drives it with real `fetch` calls for the GET handshake, a signature-rejected POST, a correctly-signed inbound message reaching the injected `onMessage`, and the formatted reply being "sent"), 150/150 workspace-wide, zero live network calls anywhere.

**Nothing deferred to the user for this milestone** — no live WhatsApp Business account/webhook registration was needed for this pass (that's a real-world deployment step for Milestone 8/10, not something testable in this repo).

**Next:** Milestone 7 — Telegram Channel (`channel-telegram`).

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
