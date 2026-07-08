# Sentinel Gateway — Contract & Conventions

**Status:** Ratified (M0)
**Applies to:** `gateway-core`, `gateway-whatsapp`, `gateway-telegram`, `concierge`, `cook`, `whatsapp-client`, `telegram-client`

---

## 1. Package Naming Convention

All packages use the `@sentinel/` npm scope and live as monorepo packages under `packages/`.

| Logical name                | npm package name             |
| --------------------------- | ---------------------------- |
| `sentinel-gateway-core`     | `@sentinel/gateway-core`     |
| `sentinel-gateway-whatsapp` | `@sentinel/gateway-whatsapp` |
| `sentinel-gateway-telegram` | `@sentinel/gateway-telegram` |
| `sentinel-concierge`        | `@sentinel/concierge`        |
| `sentinel-cook`             | `@sentinel/cook`             |
| `sentinel-whatsapp-client`  | `@sentinel/whatsapp-client`  |
| `sentinel-telegram-client`  | `@sentinel/telegram-client`  |

---

## 2. Channel Adapter Contract

The boundary between a channel shell (`gateway-whatsapp`, `gateway-telegram`) and `gateway-core` is:

### Input — `GatewayInput`

```ts
{
  from: string;   // channel-qualified user ID — format: "<channel>:<id>"
                  // e.g.  "whatsapp:6591234567"  /  "telegram:123456789"
  text?: string;  // inbound text (absent if pure media)
  media?: {
    type: "image" | "document" | "audio";
    url: string;      // direct or pre-signed download URL
    mimeType?: string;
  };
}
```

### Output — `GatewayOutput`

```ts
{
  to: string;                // echoes `from`
  reply: string | string[];  // one or more messages to send in sequence
}
```

Channel shells call `gateway-core.process(input): Promise<GatewayOutput>` then use their channel client to send each reply message.

---

## 3. App Module Contract

Each app (`concierge`, `cook`) must export a default object satisfying `AppModule<TSession>`.

### `handle(input): Promise<AppOutput>`

```ts
// Input (AppInput<TSession>)
{
  from: string;              // channel-qualified user ID
  text?: string;
  media?: InboundMedia;
  session: TSession | null;  // app-specific session slice; null on first call
}

// Output (AppOutput<TSession>)
{
  reply: string | string[];
  session: TSession | null;  // null = cleared; gateway-core tears down session
  status: "active" | "done"; // "done" also triggers gateway-core session teardown
}
```

### `tryFaq(text): { text: string } | null`

- Receives raw user text.
- Returns `{ text: "<answer>" }` on a FAQ match, or `null` if no match.
- Called by `gateway-core` **before** routing to `handle()`.
- Match logic is app-owned; substring keyword matching is acceptable.

---

## 4. FAQ Data Shape

```ts
interface FaqEntry {
  keywords: string[]; // lowercase; matched via substring on lowercased input
  answer: string;
}
type FaqData = FaqEntry[];
```

---

## 5. Session State Shape

`gateway-core` maintains an in-memory `Map<ChannelUserId, UserSession>` where:

```ts
interface UserSession {
  activeApp: "concierge" | "cook" | null;
  appSession: Record<string, unknown> | null;
}
```

- `userId` is channel-qualified (e.g. `"whatsapp:6591234567"`) — the prefix prevents cross-channel identity collisions.
- `appSession` is opaque to `gateway-core`; it is owned and interpreted entirely by the active app.

---

## 6. Menu & Escape Behaviour

**Decision: `"menu"` / `"0"` is a global interrupt at any point.**

Whenever a user sends `"menu"` or `"0"` (trimmed, case-insensitive), `gateway-core`:

1. Clears `activeApp` and `appSession` for that user.
2. Returns the main menu message.

Apps do not need to handle this — it is intercepted before routing reaches them.

---

## 7. Cook Auto-Routing on Cold Photo

**Decision: cold image sends auto-route to Cook.**

If a user sends a message where `media.type === "image"` and `activeApp === null`:

- `gateway-core` sets `activeApp = "cook"` automatically.
- The message is forwarded to Cook's `handle()` as if the user had selected Cook first.

Text messages with no active app always display the main menu.

---

## 8. Channel-Specific vs Core Responsibilities

| Concern                                 | Lives in                                |
| --------------------------------------- | --------------------------------------- |
| Webhook verification                    | Channel shell                           |
| Inbound payload parsing / normalisation | Channel shell                           |
| Outbound send calls                     | Channel shell + channel client          |
| Menu rendering                          | `gateway-core`                          |
| Session management                      | `gateway-core`                          |
| App routing + escape hatch              | `gateway-core`                          |
| Global FAQ dispatch                     | `gateway-core`                          |
| In-app FAQ dispatch                     | `gateway-core` → calls app's `tryFaq()` |
| App business logic                      | App package                             |
| AI API calls                            | App package                             |
| Calendar API calls                      | `@sentinel/concierge`                   |

---

## 9. Type Source of Truth

All shared TypeScript interfaces are defined in `packages/gateway-core/src/types.ts` and re-exported from `@sentinel/gateway-core`'s main entry point. All other packages import types from `@sentinel/gateway-core`, never duplicating them.

---

## 10. Technology Decisions

| Concern              | Choice                                     |
| -------------------- | ------------------------------------------ |
| Language             | TypeScript 5.x                             |
| HTTP framework       | Express 4.x                                |
| WhatsApp API         | Meta WhatsApp Cloud API                    |
| Telegram API         | Telegram Bot API                           |
| AI provider (Cook)   | OpenAI `gpt-4o` (vision)                   |
| Session storage (v1) | In-memory `Map` (acceptable for showpiece) |
| Monorepo tooling     | npm workspaces                             |
| Test framework       | Jest + ts-jest                             |
