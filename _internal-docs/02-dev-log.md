# Dev Log

---

## M0 — Contracts & Conventions

**Date:** 2026-07-08
**Status:** ✅ Complete

### Decisions Made

| #   | Item                         | Decision                                                                             |
| --- | ---------------------------- | ------------------------------------------------------------------------------------ |
| 1   | `menu` / `0` interrupt scope | **Global** — clears active app at any point, no mid-app state needed                 |
| 2   | Cook cold photo routing      | **Auto-route** — image sent with no active app → `activeApp = "cook"`                |
| 3   | Package naming               | `@sentinel/<name>` scoped npm packages, monorepo via npm workspaces                  |
| 4   | Channel user ID format       | `"<channel>:<id>"` (e.g. `"whatsapp:6591234567"`) — prevents cross-channel collision |
| 5   | Session storage (v1)         | In-memory `Map<ChannelUserId, UserSession>` — acceptable for showpiece               |
| 6   | AI provider for Cook         | OpenAI `gpt-4o` with vision                                                          |
| 7   | HTTP framework               | Express 4.x                                                                          |
| 8   | Language                     | TypeScript 5.x, CommonJS output                                                      |
| 9   | Test framework               | Jest + ts-jest                                                                       |
| 10  | Calendar integration         | Google Calendar API via `googleapis`                                                 |

### Deliverables Created

| File                                 | Purpose                                                     |
| ------------------------------------ | ----------------------------------------------------------- |
| `CONTRACT.md`                        | Ratified one-page contract document (all M0 items)          |
| `package.json`                       | npm workspaces monorepo root                                |
| `tsconfig.base.json`                 | Shared TypeScript compiler options                          |
| `packages/gateway-core/src/types.ts` | Single source of truth for all shared TypeScript interfaces |
| `packages/gateway-core/src/index.ts` | Re-exports all types                                        |
| `packages/*/package.json` × 7        | Package manifests for all packages                          |
| `packages/*/tsconfig.json` × 7       | Per-package TypeScript configs extending base               |

---

## M1a — `sentinel-whatsapp-client`

**Date:** 2026-07-08
**Status:** ✅ Complete

### Deliverables

| File                                             | Purpose                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/whatsapp-client/src/types.ts`          | WhatsApp Cloud API payload types + normalised output shapes                      |
| `packages/whatsapp-client/src/errors.ts`         | `WhatsAppApiError`, `WebhookSignatureError`                                      |
| `packages/whatsapp-client/src/verify.ts`         | `verifySignature()` — HMAC-SHA256 with timing-safe compare                       |
| `packages/whatsapp-client/src/normalize.ts`      | `normalizeWebhookEvent()` — maps text / image / document / audio                 |
| `packages/whatsapp-client/src/WhatsAppClient.ts` | `WhatsAppClient` class — `sendText`, `sendImage`, `getMediaUrl`, `downloadMedia` |
| `packages/whatsapp-client/src/index.ts`          | Package public API exports                                                       |

### Required env vars (consumed by `gateway-whatsapp`)

| Variable                        | Purpose                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `WHATSAPP_PHONE_NUMBER_ID`      | Meta phone number ID                                     |
| `WHATSAPP_ACCESS_TOKEN`         | Meta access token                                        |
| `WHATSAPP_APP_SECRET`           | Meta app secret (for `X-Hub-Signature-256` verification) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Custom token for webhook challenge–response              |

### Notes

- `axios` 1.x ships its own TypeScript types — `@types/axios` is not needed.
- Inbound media is returned as `rawMedia.mediaId`; gateway-whatsapp must call `client.getMediaUrl()` to resolve to a URL before forwarding to gateway-core.
- Signature verification uses `crypto.timingSafeEqual` to prevent timing attacks.

---

## M1b — `sentinel-telegram-client`

**Date:** 2026-07-08
**Status:** ✅ Complete

### Deliverables

| File                                             | Purpose                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `packages/telegram-client/src/types.ts`          | Telegram Bot API payload types + normalised output shapes                                         |
| `packages/telegram-client/src/errors.ts`         | `TelegramApiError`, `WebhookSecretError`                                                          |
| `packages/telegram-client/src/verify.ts`         | `verifySecretToken()` — timing-safe compare of `X-Telegram-Bot-Api-Secret-Token`                  |
| `packages/telegram-client/src/normalize.ts`      | `normalizeWebhookEvent()` — maps text / photo / document / audio / voice                          |
| `packages/telegram-client/src/TelegramClient.ts` | `TelegramClient` class — `sendText`, `sendPhoto`, `getFileUrl`, `downloadFile`, `registerWebhook` |
| `packages/telegram-client/src/index.ts`          | Package public API exports                                                                        |

### Required env vars (consumed by `gateway-telegram`)

| Variable                  | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `TELEGRAM_BOT_TOKEN`      | BotFather token                          |
| `TELEGRAM_WEBHOOK_SECRET` | Secret token registered via `setWebhook` |

### Notes

- Photo messages: Telegram sends an array of `PhotoSize` objects at different resolutions; the largest (last) is used.
- `NormalizedEvent` shape is identical to the WhatsApp client's — same contract for gateway-core.
- `registerWebhook()` is a one-time setup helper; not called during normal message handling.

---

## M2a — `sentinel-gateway-core`

**Date:** 2026-07-08
**Status:** ✅ Complete

### Deliverables

| File                                   | Purpose                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/gateway-core/src/session.ts` | `SessionManager` — in-memory `Map<ChannelUserId, UserSession>` with get / set / clear |
| `packages/gateway-core/src/menu.ts`    | `MENU_TEXT`, `isMenuEscape()`, `parseMenuSelection()`                                 |
| `packages/gateway-core/src/faq.ts`     | Global FAQ entries + `tryGlobalFaq()`                                                 |
| `packages/gateway-core/src/gateway.ts` | `createGateway(apps)` factory — `process()` entry point                               |
| `packages/gateway-core/src/index.ts`   | Updated to export all new symbols                                                     |

### `process()` logic flow

1. **Global escape** — `text` matches `"menu"` / `"0"` → clear session, return menu
2. **No active app:**
   - Global FAQ → return answer if match
   - Menu selection (`"1"` / `"2"`) → set `activeApp`, fall through to dispatch
   - Cold image → set `activeApp = "cook"`, fall through to dispatch
   - Otherwise → return menu
3. **Active app:**
   - App's `tryFaq()` → return answer if match
   - `app.handle()` → persist session, return reply
   - `status === "done"` or `session === null` → clear session, append menu

---

## M2b — `sentinel-gateway-whatsapp`

**Date:** 2026-07-08
**Status:** ✅ Complete

### Deliverables

| File                                             | Purpose                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `packages/gateway-whatsapp/src/config.ts`        | Reads and validates required env vars at startup                 |
| `packages/gateway-whatsapp/src/webhookRouter.ts` | GET challenge + POST message handler                             |
| `packages/gateway-whatsapp/src/app.ts`           | Express app factory — wires webhook router with gateway + client |
| `packages/gateway-whatsapp/src/index.ts`         | Entry point — app registration placeholder (apps wired in M5)    |
| `packages/gateway-whatsapp/.env.example`         | Documents all required env vars                                  |

### POST /webhook flow

1. Verify `X-Hub-Signature-256` → 403 if invalid
2. Acknowledge `200` immediately (before async processing)
3. `normalizeWebhookEvent()` → skip status updates / unsupported types
4. If `rawMedia` → `client.getMediaUrl()` resolves ID to URL
5. `gateway.process(GatewayInput)` → `GatewayOutput`
6. Strip `"whatsapp:"` prefix, send each reply via `client.sendText()`

### Verification

- Zero menu / routing / session logic — all delegated to `gateway-core`.

---

## M2c — `sentinel-gateway-telegram`

**Date:** 2026-07-08
**Status:** ✅ Complete

### Deliverables

| File                                             | Purpose                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `packages/gateway-telegram/src/config.ts`        | Reads and validates `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`                   |
| `packages/gateway-telegram/src/webhookRouter.ts` | POST /webhook — verify secret token → normalize → resolve media → dispatch → sendText |
| `packages/gateway-telegram/src/app.ts`           | Express app factory                                                                   |
| `packages/gateway-telegram/src/index.ts`         | Entry point (app registration placeholder)                                            |
| `packages/gateway-telegram/.env.example`         | Env var documentation                                                                 |

### Contract compatibility findings

No changes to `gateway-core`'s contract were required. The channel adapter contract held across both channels:

| Difference                                                 | Resolution                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| Telegram uses `X-Telegram-Bot-Api-Secret-Token` (not HMAC) | Handled in channel shell — no gateway-core impact                      |
| Telegram `chat_id` is a number, not a phone number string  | Shell extracts it from `"telegram:<id>"` — no gateway-core impact      |
| Telegram `getFileUrl()` returns only `url` (no `mimeType`) | `mimeType` forwarded from `rawMedia.mimeType` set during normalisation |

---

## M3 — `sentinel-concierge`

**Date:** 2026-07-08
**Status:** ✅ Complete

### Deliverables

| File                                   | Purpose                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/concierge/src/types.ts`      | `ConciergeSession` — multi-turn state shape                                                      |
| `packages/concierge/src/faq.ts`        | Concierge FAQ entries + `tryConciergeFaq()`                                                      |
| `packages/concierge/src/holidays.ts`   | Singapore public holidays 2025–2026 + `isPublicHoliday()`, `isWeekend()`                         |
| `packages/concierge/src/calendar.ts`   | Google Calendar integration — `getAvailableSlots()`, `createBooking()`                           |
| `packages/concierge/src/dateParser.ts` | `parseDate()` — handles "tomorrow", "next Monday", "15 July", "YYYY-MM-DD", etc.                 |
| `packages/concierge/src/flow.ts`       | `handleConcierge()` — 3-step booking flow (date → time → confirm)                                |
| `packages/concierge/src/config.ts`     | Reads `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID` |
| `packages/concierge/src/index.ts`      | `AppModule<ConciergeSession>` default export                                                     |
| `packages/concierge/.env.example`      | Google Calendar env var documentation                                                            |

### Booking flow (3 turns)

```
turn 1: session=null → INTRO + step="awaiting_date"
turn 2: text=date   → validate → getAvailableSlots() → list slots + step="awaiting_time"
turn 3: text=number → confirm prompt + step="confirming"
turn 4: text="yes"  → createBooking() → confirmation + status="done"
```

### Required env vars

| Variable                             | Purpose                               |
| ------------------------------------ | ------------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`       | Service account for Calendar API auth |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Service account private key (PEM)     |
| `GOOGLE_CALENDAR_ID`                 | Calendar to check/write bookings      |

---

## M4 — `sentinel-cook`

**Date:** 2026-07-08
**Status:** ✅ Complete

### Deliverables

| File | Purpose |
|---|---|
| `packages/cook/src/types.ts` | `CookSession` — minimal state (`step: "awaiting_photo"`) |
| `packages/cook/src/faq.ts` | Cook FAQ entries + `tryCookFaq()` |
| `packages/cook/src/openai.ts` | `analyzeDish()` — gpt-4o vision call with `response_format: json_object` |
| `packages/cook/src/formatter.ts` | `formatDishAnalysis()` — WhatsApp *bold* / plain text output |
| `packages/cook/src/flow.ts` | `handleCook()` — cold photo / menu-selected / awaiting-photo flows |
| `packages/cook/src/config.ts` | Reads `OPENAI_API_KEY` |
| `packages/cook/src/index.ts` | `AppModule<CookSession>` default export |
| `packages/cook/.env.example` | `OPENAI_API_KEY` documentation |

### Flow

```
cold photo (auto-route): session=null + media  → analyzeDish() → formatted reply → status="done"
menu-selected:           session=null, no photo → prompt for photo → step="awaiting_photo"
awaiting_photo + photo:  analyzeDish() → reply → status="done"
awaiting_photo + text:   re-prompt
```

### OpenAI call details
- Model: `gpt-4o`, `response_format: { type: "json_object" }`, `detail: "low"`, max_tokens: 1200

---
