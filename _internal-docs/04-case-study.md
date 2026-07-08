# Case Study — GraceSoft Sentinel

**Type:** Showpiece / Portfolio Project
**Stack:** TypeScript · Node.js · Express · OpenAI · Google Calendar · WhatsApp Cloud API · Telegram Bot API
**Audience:** Potential clients evaluating AI chatbot + calendar automation capabilities

---

## Situation

Many businesses need a multi-channel conversational assistant that handles bookings and product/service queries without a complex UI. Building separate bots for WhatsApp and Telegram typically means duplicating all business logic.

## Complication

Existing solutions either:

- Lock you into a single messaging platform, or
- Require expensive third-party bot platforms that obscure the underlying architecture.

A portfolio piece needed to demonstrate the ability to design a clean, extensible architecture that works across channels — without duplicating a single line of business logic.

## Resolution

**Sentinel Gateway** was built as a monorepo with a channel-agnostic core and two thin channel shells.

### Architecture decision

The key insight: separate _what a message means_ (routing, session, apps) from _where it came from_ (WhatsApp vs Telegram). A single `process(input): output` function handles all logic; the channel shells only translate payloads.

### Channel adapter contract

Defined a strict input/output contract (`GatewayInput` / `GatewayOutput`) that both channel shells implement. The contract was validated against two consumers (WhatsApp + Telegram) from day one — no theoretical channel-agnosticism that collapses at the second channel.

### App module contract

Each app (`Concierge`, `Cook`) satisfies `AppModule<TSession>`: a `handle()` function for business logic and a `tryFaq()` function for keyword FAQ matching. The gateway calls `tryFaq()` before routing to `handle()`, so FAQ answers never require app state.

### Key features demonstrated

- **Multi-turn booking flow** (Concierge): 3-step date → time → confirm with Google Calendar free/busy queries and Singapore public-holiday awareness.
- **Vision AI recipe generation** (Cook): single-photo → structured JSON → formatted recipe + nutrition via OpenAI gpt-4o.
- **Global escape hatch**: `menu` / `0` clears session at any point on any channel.
- **Cold photo auto-routing**: sending a photo with no active app auto-routes to Cook.
- **19 integration tests** covering all E2E flows, session isolation, and cross-channel non-bleed.

## Results

- Full channel-agnostic architecture achieved: zero routing/session code duplicated across WhatsApp and Telegram shells.
- Contract validated against two channels simultaneously — no surprises at integration.
- 19/19 integration tests passing; TypeScript strict mode throughout.
- Deployment-ready: two independent Express services, structured JSON logging, consolidated env var documentation.
