# GraceSoft Sentinel — Milestone Checklist

**Project:** Multi-app WhatsApp + Telegram showpiece (Concierge + Cook) behind a shared gateway core
**Status:** In Progress — M0 complete
**Scope:** Fresh build, channel-agnostic module contract, two channel shells (WhatsApp, Telegram)

---

## Repos

- [ ] `sentinel-gateway-core` — numeric menu, session state, routing, FAQ dispatch (channel-agnostic)
- [ ] `sentinel-gateway-whatsapp` — thin shell: WhatsApp webhook + payload translation, imports `gateway-core`
- [ ] `sentinel-gateway-telegram` — thin shell: Telegram Bot API + payload translation, imports `gateway-core`
- [ ] `sentinel-concierge` — FAQ + calendar booking
- [ ] `sentinel-cook` — dish photo → recipe/nutrition
- [ ] `sentinel-whatsapp-client` — WhatsApp Cloud API client (verify, send, download media)
- [ ] `sentinel-telegram-client` — Telegram Bot API client (verify, send, download media)

---

## M0 — Contracts & Conventions (build this first, before any app logic)

- [x] Finalize `handle(input)` contract (text/media/session in → reply/session/status out)
- [x] Finalize `tryFaq(text)` contract (returns `{ text }` or `null`)
- [x] Finalize FAQ data shape: `{ keywords: string[], answer: string }[]`
- [x] Finalize session state shape: `{ [userId]: { activeApp, appSession } }` (userId = channel-qualified, e.g. `whatsapp:6591234567` / `telegram:123456789`, so the two channels can't collide)
- [x] Decide: is "menu"/"0" a global interrupt at any point, or only when `status: "done"`? → **Global interrupt at any point**
- [x] Decide: does Cook require menu selection first, or auto-route on cold photo send? → **Auto-route on cold photo send**
- [x] Confirm repo/package naming convention across all repos → **`@sentinel/<name>` scoped npm packages**
- [x] Define the **channel adapter contract**: what `gateway-core` expects in (`{ from, text?, media? }`) and returns out (`{ to, reply }`) — same shape regardless of channel
- [x] Define what stays channel-specific vs. core: webhook verification, payload parsing, and send-message calls live in the channel shell; menu, routing, session, FAQ dispatch live in `gateway-core`
- [x] Note: building both WhatsApp and Telegram shells against `gateway-core` from the start means the contract gets validated against two consumers immediately, rather than being a guess
- [x] Write a one-page `CONTRACT.md` documenting all of the above, shared as reference across repos

---

## M1a — `sentinel-whatsapp-client`

- [x] WhatsApp Cloud API setup (Meta app, test number, access token) — env vars documented in dev log
- [x] Webhook signature verification (`X-Hub-Signature-256`)
- [x] Send text message
- [x] Send media message (image at minimum; document/audio if needed later)
- [x] Download inbound media (image from user)
- [x] Normalize inbound payload → `{ text?, media? }` shape
- [x] Basic error handling (expired media URL, rate limit, invalid number)
- [x] Package it as an installable module (npm/git dependency ready)

## M1b — `sentinel-telegram-client`

- [x] Telegram Bot API setup (BotFather token, webhook registration)
- [x] Webhook secret token verification
- [x] Send text message
- [x] Send media message (image at minimum)
- [x] Download inbound media (photo from user)
- [x] Normalize inbound payload → `{ text?, media? }` shape (same shape as WhatsApp client's output)
- [x] Basic error handling (rate limit, invalid chat id)
- [x] Package it as an installable module (npm/git dependency ready)

---

## M2a — `sentinel-gateway-core` (channel-agnostic)

- [ ] In-memory session store (per user identifier — channel-neutral, not "phone number")
- [ ] Numeric menu rendering (`1. Concierge`, `2. Cook`, etc.)
- [ ] Menu selection handling (numeric input → set `activeApp`)
- [ ] Global FAQ (top-level: "what is this", "what is Concierge", "what is Cook")
- [ ] Routing: forward message to active app's `handle()`
- [ ] In-app FAQ dispatch: try active app's `tryFaq()` before `handle()`
- [ ] Global "menu"/"0" escape hatch (per M0 decision)
- [ ] Session teardown when app reports `status: "done"`
- [ ] Expose a single entry point channel shells call (e.g. `process(input): output`)
- [ ] Package as installable module (consumed by `gateway-whatsapp`, and any future channel shell)

## M2b — `sentinel-gateway-whatsapp` (thin shell)

- [ ] Webhook endpoint (receive + verify + ack)
- [ ] Translate inbound WhatsApp payload → `gateway-core`'s expected input shape
- [ ] Translate `gateway-core`'s reply → outbound WhatsApp send call
- [ ] Wire in `sentinel-whatsapp-client` for actual send/receive/media
- [ ] Import and call `sentinel-gateway-core` as a dependency
- [ ] Confirm this repo contains _no_ menu/routing/session logic — only translation + wiring

## M2c — `sentinel-gateway-telegram` (thin shell)

- [ ] Webhook endpoint (receive + verify + ack)
- [ ] Translate inbound Telegram payload → `gateway-core`'s expected input shape
- [ ] Translate `gateway-core`'s reply → outbound Telegram send call
- [ ] Wire in `sentinel-telegram-client` for actual send/receive/media
- [ ] Import and call `sentinel-gateway-core` as a dependency
- [ ] Confirm this repo contains _no_ menu/routing/session logic — only translation + wiring
- [ ] Flag any place Telegram's payload/behavior forces a change to `gateway-core`'s contract (this is the real test of whether the contract is actually channel-agnostic)

---

## M3 — `sentinel-concierge`

- [ ] Define Concierge FAQ content (keywords + answers)
- [ ] Google Calendar integration (read availability)
- [ ] Booking flow (multi-turn: date → time → confirm)
- [ ] Public-holiday awareness (reuse logic from earlier prototype, rebuilt fresh)
- [ ] Implement `handle()` per M0 contract
- [ ] Implement `tryFaq()` per M0 contract
- [ ] Session shape for mid-booking state (must tolerate abandonment via menu escape)
- [ ] Package as installable module

---

## M4 — `sentinel-cook`

- [ ] Image input handling (single dish photo)
- [ ] AI call: image → dish identification
- [ ] AI call: dish → recipe steps
- [ ] AI call: dish → nutritional information
- [ ] Response formatting (text-friendly for WhatsApp; no rich UI available)
- [ ] Define Cook FAQ content (keywords + answers)
- [ ] Implement `handle()` per M0 contract
- [ ] Implement `tryFaq()` per M0 contract
- [ ] Package as installable module

---

## M5 — Integration

- [ ] `gateway-core` imports Concierge + Cook as git/npm dependencies
- [ ] `gateway-whatsapp` imports `gateway-core` + `sentinel-whatsapp-client`
- [ ] `gateway-telegram` imports `gateway-core` + `sentinel-telegram-client`
- [ ] End-to-end test (WhatsApp): cold start → menu → Concierge → booking → done → back to menu
- [ ] End-to-end test (WhatsApp): cold start → menu → Cook → photo → recipe → done → back to menu
- [ ] End-to-end test (Telegram): same two flows as above
- [ ] End-to-end test: mid-flow "menu" interrupt on both apps, both channels
- [ ] End-to-end test: FAQ hit inside each app, both channels
- [ ] End-to-end test: global FAQ at top-level menu, both channels
- [ ] Verify session isolation across concurrent users on the same channel
- [ ] Verify session isolation across the same user's identity on different channels (e.g. no cross-channel bleed)

---

## M6 — Showpiece Polish

- [ ] Meta Developer dashboard: test numbers, webhook URL, app review status check
- [ ] Telegram bot: production webhook URL set, bot profile/description filled in
- [ ] Deployment target decided (Laravel Cloud, or separate Node hosting?)
- [ ] Logging/observability for demo debugging (structured logs at minimum)
- [ ] Written demo script (what to type, in what order, to showcase both apps on both channels)
- [ ] README per repo (setup, env vars, how to run locally)
- [ ] Case study / SCR write-up for gracesoft.dev (per existing product documentation pattern)

---

## Deferred (explicitly out of scope for v1)

- Persistent session storage (Redis/Postgres) — in-memory accepted for showpiece
- Any channel beyond WhatsApp + Telegram (e.g. Signal, SMS) — contract proven against two channels, third is a documented future exercise
- Horizontal scaling / multi-instance gateway
