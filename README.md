# GraceSoft Sentinel

A production-quality WhatsApp + Telegram AI assistant platform built as a showpiece for [gracesoft.dev](https://gracesoft.dev).

Two apps, two channels, one shared channel-agnostic core.

---

## Apps

| App           | Description                                                                          |
| ------------- | ------------------------------------------------------------------------------------ |
| **Concierge** | Multi-turn booking flow with Google Calendar availability + public-holiday awareness |
| **Cook**      | Send a dish photo → get the recipe + nutritional info via OpenAI gpt-4o vision       |

## Channels

| Channel                   | Package                     |
| ------------------------- | --------------------------- |
| WhatsApp (Meta Cloud API) | `packages/gateway-whatsapp` |
| Telegram (Bot API)        | `packages/gateway-telegram` |

---

## Monorepo Structure

```
packages/
  gateway-core/       # Channel-agnostic engine (menu, session, routing, FAQ)
  gateway-whatsapp/   # WhatsApp channel shell (webhook + payload translation)
  gateway-telegram/   # Telegram channel shell (webhook + payload translation)
  concierge/          # Concierge app (Google Calendar booking)
  cook/               # Cook app (OpenAI gpt-4o vision)
  whatsapp-client/    # WhatsApp Cloud API client
  telegram-client/    # Telegram Bot API client
```

## Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- Meta Developer account (WhatsApp Cloud API)
- Telegram Bot (via BotFather)
- Google Cloud service account with Calendar API enabled
- OpenAI API key

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in all variables in .env

# 3. Build all packages
npm run build

# 4. Start WhatsApp gateway
cd packages/gateway-whatsapp
node dist/index.js

# 5. Start Telegram gateway (separate terminal)
cd packages/gateway-telegram
node dist/index.js
```

## Environment Variables

See [.env.example](.env.example) for the full list. Each gateway shell needs:

- WhatsApp: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
- Concierge: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID`
- Cook: `OPENAI_API_KEY`

## Tests

```bash
npm test
```

19 integration tests covering all E2E flows, session isolation, FAQ dispatch, and escape handling.

## Architecture

See [CONTRACT.md](CONTRACT.md) for the full channel adapter + app module contract.

---

Built with TypeScript · Express · OpenAI · Google Calendar · WhatsApp Cloud API · Telegram Bot API
