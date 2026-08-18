# @gracesoft-sentinel/core

## 0.3.0

### Minor Changes

- Add `transcribeAudio` to the `AIProvider` interface (+ `TranscribeAudioInput`/`TranscribeAudioResult` schemas), the capability behind Milestone 11's voice-note support. Every existing `AIProvider` implementation (OpenAI, Gemini) and test double had to add it; `runAIProviderContractTests` now exercises it too.

## 0.2.0

### Minor Changes

- Add `SessionStore` interface + shared contract test suite (`runSessionStoreContractTests`), the capability surface Milestone 8's Redis-backed session store implements. `ConversationState` (the data shape) already existed since Milestone 1; this adds the swappable persistence interface around it, mirroring `CalendarProvider`/`AIProvider`.

## 0.1.0

Initial release. Defines the channel-agnostic, provider-agnostic contracts every other package in the monorepo implements or consumes:

- `NormalizedMessage` / `NormalizedResponse`
- `ChannelAdapter` interface + shared contract test suite
- `AIProvider` interface + shared contract test suite
- `CalendarProvider` interface + shared contract test suite (including the dated-exception `BusinessHours` shape the Milestone 2 business-hours bug fix builds on)
- `RecipeSourceProvider` interface (minimal, future-facing — Milestone 11)
- `ConversationState` contract
- `BusinessConfig` contract

All data shapes are backed by Zod schemas for runtime validation, not just compile-time types.
