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

| File | Purpose |
|---|---|
| `packages/whatsapp-client/src/types.ts` | WhatsApp Cloud API payload types + normalised output shapes |
| `packages/whatsapp-client/src/errors.ts` | `WhatsAppApiError`, `WebhookSignatureError` |
| `packages/whatsapp-client/src/verify.ts` | `verifySignature()` — HMAC-SHA256 with timing-safe compare |
| `packages/whatsapp-client/src/normalize.ts` | `normalizeWebhookEvent()` — maps text / image / document / audio |
| `packages/whatsapp-client/src/WhatsAppClient.ts` | `WhatsAppClient` class — `sendText`, `sendImage`, `getMediaUrl`, `downloadMedia` |
| `packages/whatsapp-client/src/index.ts` | Package public API exports |

### Required env vars (consumed by `gateway-whatsapp`)

| Variable | Purpose |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Meta phone number ID |
| `WHATSAPP_ACCESS_TOKEN` | Meta access token |
| `WHATSAPP_APP_SECRET` | Meta app secret (for `X-Hub-Signature-256` verification) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Custom token for webhook challenge–response |

### Notes
- `axios` 1.x ships its own TypeScript types — `@types/axios` is not needed.
- Inbound media is returned as `rawMedia.mediaId`; gateway-whatsapp must call `client.getMediaUrl()` to resolve to a URL before forwarding to gateway-core.
- Signature verification uses `crypto.timingSafeEqual` to prevent timing attacks.

---
