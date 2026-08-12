# @gracesoft-sentinel/core

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
