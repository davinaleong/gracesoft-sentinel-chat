# Dev Log

---

## M0 — Contracts & Conventions

**Date:** 2026-07-08
**Status:** ✅ Complete

### Decisions Made

| # | Item | Decision |
|---|---|---|
| 1 | `menu` / `0` interrupt scope | **Global** — clears active app at any point, no mid-app state needed |
| 2 | Cook cold photo routing | **Auto-route** — image sent with no active app → `activeApp = "cook"` |
| 3 | Package naming | `@sentinel/<name>` scoped npm packages, monorepo via npm workspaces |
| 4 | Channel user ID format | `"<channel>:<id>"` (e.g. `"whatsapp:6591234567"`) — prevents cross-channel collision |
| 5 | Session storage (v1) | In-memory `Map<ChannelUserId, UserSession>` — acceptable for showpiece |
| 6 | AI provider for Cook | OpenAI `gpt-4o` with vision |
| 7 | HTTP framework | Express 4.x |
| 8 | Language | TypeScript 5.x, CommonJS output |
| 9 | Test framework | Jest + ts-jest |
| 10 | Calendar integration | Google Calendar API via `googleapis` |

### Deliverables Created

| File | Purpose |
|---|---|
| `CONTRACT.md` | Ratified one-page contract document (all M0 items) |
| `package.json` | npm workspaces monorepo root |
| `tsconfig.base.json` | Shared TypeScript compiler options |
| `packages/gateway-core/src/types.ts` | Single source of truth for all shared TypeScript interfaces |
| `packages/gateway-core/src/index.ts` | Re-exports all types |
| `packages/*/package.json` × 7 | Package manifests for all packages |
| `packages/*/tsconfig.json` × 7 | Per-package TypeScript configs extending base |

---
