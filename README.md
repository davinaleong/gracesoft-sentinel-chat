# GraceSoft Sentinel Chat

GraceSoft Sentinel's collection of AI chat agents — **Sentinel Concierge** (FAQ answering + appointment booking) and **Sentinel Cook** (dish-photo recipe generation) — rebuilt as platform-agnostic AI agents inside one pnpm monorepo.

Each agent is channel- and provider-agnostic: it depends only on small interfaces from `@gracesoft-sentinel/core` (`ChannelAdapter`, `AIProvider`, `CalendarProvider`, `SessionStore`, `RecipeSourceProvider`, ...), never on a concrete WhatsApp/Telegram/OpenAI/Google package directly. Concrete implementations live in their own packages and are wired together only at the service layer (`apps/*`). Every package is structured as if it could be split into its own repo tomorrow — own `package.json`, own `exports`, own tests — with `.dependency-cruiser.cjs` enforcing that boundary in CI.

## Status

All 11 planned milestones are complete. See [`_internal-docs/01-milestone-checklist.md`](_internal-docs/01-milestone-checklist.md) for the full build history and [`_internal-docs/05-progress-log.md`](_internal-docs/05-progress-log.md) for a narrated log of what was built and why. What's left is real infrastructure this repo can't provide on its own — live hosting, live OpenAI/Google/WhatsApp/Telegram credentials, and manual/live-LLM validation — each such item is explicitly annotated rather than silently skipped.

## Architecture

```
apps/
  concierge-service/   Sentinel Concierge — HTTP service wiring agent-concierge to every provider
  cook-service/         Sentinel Cook — HTTP service wiring agent-cook to every provider
  legal-site/            Static privacy-policy / terms pages for both agents

packages/
  core/                          Shared Zod contracts: NormalizedMessage, ChannelAdapter, AIProvider,
                                  CalendarProvider, SessionStore, BusinessConfig, RecipeSourceProvider, ...
  agent-concierge/               FAQ + booking agent logic — channel/provider-agnostic
  agent-cook/                    Recipe agent logic — channel/provider-agnostic

  channel-whatsapp/              ChannelAdapter: WhatsApp Cloud API
  channel-telegram/              ChannelAdapter: Telegram Bot API
  channel-sms/                   ChannelAdapter: SMS/MMS via Twilio

  provider-ai-openai/            AIProvider: OpenAI (chat, vision, embeddings, Whisper transcription)
  provider-ai-gemini/            AIProvider: Google Gemini
  provider-calendar-google/      CalendarProvider: Google Calendar
  provider-session-redis/        SessionStore: Redis
  provider-drive-google/         RecipeSourceProvider: personal recipe retrieval via RAG over Google Drive

  logging/                       Structured logging (pino) + PII redaction
  logging-postgres/               Conversation/booking audit logging to Postgres
  legal-concierge/, legal-cook/   Static legal/PDPA content packages consumed by legal-site

  config-eslint/, config-tsconfig/  Shared lint/TS config
```

**Data flow:** a channel webhook hits an `apps/*-service` route → the matching `ChannelAdapter.parseInbound()` turns it into a `NormalizedMessage` → the service layer resolves session state and business config, then calls the agent's `handleMessage()` → the agent calls whatever `AIProvider`/`CalendarProvider`/`RecipeSourceProvider` it was given → the result flows back through `ChannelAdapter.formatOutbound()` to the channel's own reply API.

Notable capabilities: multi-tenant `BusinessConfig` resolution (multiple businesses on one Concierge deployment, keyed by `NormalizedMessage.businessChannelId`), voice-note transcription, grocery-list/meal-plan generation, and an opt-in "Mother's Day Edition" personal-recipe RAG lookup — all documented in the progress log.

## Getting started

Requires Node.js ≥ 20 and pnpm.

```bash
pnpm install
```

Common workspace-wide commands (each runs across every package):

```bash
pnpm build        # tsc -b for every package
pnpm test         # vitest for every package
pnpm lint         # eslint for every package
pnpm typecheck    # tsc --noEmit for every package
pnpm boundaries   # dependency-cruiser package-boundary check
pnpm test:integration  # root-level cross-channel/cross-package tests (tests/)
```

To work on a single package: `pnpm --filter @gracesoft-sentinel/<name> <script>`.

> Rebuild order matters: `@gracesoft-sentinel/core` must be built before any package that depends on it (most of them), since `tsc -b` resolves workspace dependencies via their compiled `dist/*.d.ts`, not source.

## Running a service locally

Each service under `apps/` needs its own `.env` (see the `.env.example` in that directory) with real OpenAI/Google/WhatsApp/Telegram/Twilio credentials — nothing in this repo fabricates those. `docker-compose.yml` at the root brings up Redis, Postgres, and both services together:

```bash
docker compose up --build
```

## Contracts and testing philosophy

Every interface in `core` ships with a shared contract test suite (e.g. `runChannelAdapterContractTests`, `runAIProviderContractTests`) that every implementation runs against — so a WhatsApp adapter and a from-scratch SMS adapter are held to the exact same behavioral guarantees. Package boundaries (no agent importing a concrete channel/provider, no package reaching into another's internals) are enforced by `.dependency-cruiser.cjs` and checked in CI (`.github/workflows/ci.yml`).

## License

See [`LICENSE`](LICENSE).
