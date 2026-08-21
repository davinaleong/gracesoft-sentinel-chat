# @gracesoft-sentinel/core

## 0.5.0

### Minor Changes

- `CalendarProvider` gains `cancelBooking` (+ `CancelBookingInput`), the capability behind the concierge's cancel-appointment flow. Idempotent by contract — cancelling an already-cancelled or nonexistent booking must not throw. `runCalendarProviderContractTests` now exercises it; `provider-calendar-google` implements it via `events.delete`, swallowing a 404/410 from an already-deleted event.
- `BusinessConfig` gains an optional `maxBookingHorizonDays`, letting a business cap how far ahead chatters may book or reschedule — mirrors the slot engine's own `horizonDays`/`DEFAULT_HORIZON_DAYS` vocabulary. Unset (the default) preserves prior behavior — no cap beyond the slot engine's own search horizon. `apps/concierge-service` also honors a `DEFAULT_MAX_BOOKING_HORIZON_DAYS` env var as a deployment-wide fallback for any business config that doesn't set its own value.

## 0.4.0

### Minor Changes

- `CreateBookingInput`/`Booking` gain a required `appointmentId` field, and `CalendarProvider` gains `findBookingByAppointmentId`/`updateBooking` — the capability surface behind chatter-facing appointment ids and the reschedule flow. `runCalendarProviderContractTests` now exercises all three; `provider-calendar-google` indexes `appointmentId` via Google Calendar's `extendedProperties.private`, never by parsing event text.

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
