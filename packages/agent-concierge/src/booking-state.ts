import type { AvailabilitySlot, ConversationState } from "@gracesoft-sentinel/core";
import type { Dayjs } from "dayjs";
import { inBusinessTz } from "./time.js";

export interface BookingCandidate {
  id: string;
  start: string;
  end: string;
}

export interface BookingsTodayCounter {
  /** "YYYY-MM-DD" in the business's timezone. */
  date: string;
  count: number;
}

/** Shape agent-concierge owns within `ConversationState.context`. */
export interface ConciergeContext {
  bookingCandidates?: BookingCandidate[];
  lastEscalatedMessage?: string;
  /**
   * ISO timestamp of when the AI disclosure was last actually shown.
   * Compared against `ai_disclosure.redisclosure_after_hours` (not the
   * session's own TTL) to decide whether to show it again — deliberately a
   * timestamp, not a boolean, so a conversation kept alive by routine
   * activity doesn't suppress this compliance requirement forever.
   */
  aiDisclosedAt?: string;
  /** Most recent appointment id this chatter (session) has booked — an opportunistic convenience, not an auth guarantee. */
  lastAppointmentId?: string;
  bookingsToday?: BookingsTodayCounter;
  /** True while awaiting the chatter's reply to "what's your appointment id?". */
  awaitingAppointmentId?: boolean;
  /** Set when offering `lastAppointmentId` as a guess and awaiting yes/no confirmation. */
  pendingRescheduleConfirmationId?: string;
  /**
   * The provider's own booking id (not the human appointment id) — set
   * alongside `bookingCandidates` during a reschedule's slot-offer phase so
   * `handlePendingSelection` knows to call `updateBooking` instead of
   * `createBooking` on selection.
   */
  reschedulingBookingId?: string;
  /** True while awaiting the chatter's reply to "what's your appointment id?" for a cancellation. Separate from `awaitingAppointmentId` (reschedule) so the two flows can't be confused with each other. */
  awaitingCancelAppointmentId?: boolean;
  /** Set when offering `lastAppointmentId` as a guess for a cancellation and awaiting yes/no confirmation. */
  pendingCancelConfirmationId?: string;
  /** The provider's own booking id for a *located* booking awaiting final "are you sure?" confirmation before it's actually cancelled — cancellation is destructive, so this extra step exists even though reschedule doesn't need one. */
  pendingCancelBookingId?: string;
  /**
   * Set when a date/time-only message arrives while the chatter has an
   * existing `lastAppointmentId` and no explicit booking keyword — it's
   * genuinely ambiguous whether they mean to move that booking or start a
   * new one, so this holds the parsed date/time while we ask, rather than
   * silently guessing (see the regression test for what silently guessing
   * did: a second, unrelated booking, with the original left untouched and
   * the chatter never told).
   *
   * Deliberately *not* covered by `looksLikeFreshTopic`'s generic escape
   * hatch (see handleMessageInner) — same reason as `pendingCancelBookingId`:
   * the word "booking" in the chatter's own expected reply ("new booking")
   * would itself satisfy `parseBookingRequest(...).hasBookingIntent`,
   * tripping the escape hatch before this state's own handler ever saw the
   * reply it was waiting for. `handleBookingVsRescheduleAmbiguity` has full
   * first-refusal control over its own pending replies instead.
   */
  pendingBookingAmbiguity?: { date?: string; time?: string };
  [key: string]: unknown;
}

/**
 * Merges `patch` onto the existing context rather than replacing it —
 * session-lifetime fields (`aiDisclosedAt`, `lastAppointmentId`,
 * `bookingsToday`, ...) must survive turns whose own concern is unrelated
 * to them. A field is only actually cleared when a patch explicitly sets it
 * to `undefined` (e.g. `{ bookingCandidates: undefined }` once a booking
 * flow concludes) — the equivalent of `context.bookingCandidates` never
 * having been set, everywhere this codebase checks for it.
 */
export function withContext(state: ConversationState, patch: Partial<ConciergeContext>): ConversationState {
  const context: ConciergeContext = { ...(state.context as ConciergeContext), ...patch };
  return { ...state, context, updatedAt: new Date().toISOString() };
}

export const DAILY_BOOKING_LIMIT = 3;

export function bookingsMadeToday(context: ConciergeContext, today: Dayjs): number {
  const counter = context.bookingsToday;
  if (!counter || counter.date !== today.format("YYYY-MM-DD")) return 0;
  return counter.count;
}

export function incrementBookingsToday(context: ConciergeContext, today: Dayjs): BookingsTodayCounter {
  return { date: today.format("YYYY-MM-DD"), count: bookingsMadeToday(context, today) + 1 };
}

export function toBookingCandidates(slots: AvailabilitySlot[]): BookingCandidate[] {
  return slots.map((slot, index) => ({ id: `slot-${index + 1}`, start: slot.start, end: slot.end }));
}

export function formatSlotLabel(iso: string, timezone: string): string {
  return inBusinessTz(iso, timezone).format("ddd, D MMM, h:mma");
}

/**
 * Checked in priority order, most-to-least unambiguous. Bare number words
 * ("one", "two", "three") are checked last because they're ordinary English
 * words that can appear in a sentence without meaning an ordinal — e.g.
 * "the 2nd one" contains the word "one" as a noun, not as a synonym for
 * "first"; if word-forms were checked without regard to specificity, that
 * sentence would wrongly resolve to slot 1 instead of slot 2.
 */
const ORDINAL_PATTERNS: [RegExp, number][] = [
  [/\b1(?:st)?\b/, 1],
  [/\b2(?:nd)?\b/, 2],
  [/\b3(?:rd)?\b/, 3],
  [/\bfirst\b/, 1],
  [/\bsecond\b/, 2],
  [/\bthird\b/, 3],
  [/\bone\b/, 1],
  [/\btwo\b/, 2],
  [/\bthree\b/, 3],
];

// Includes bare "cannot" (very common Singlish rejection on its own, e.g.
// "cannot leh") alongside the fuller "can't make it" phrasing — safe here
// since this is only ever checked while candidates are actively pending
// (i.e. we just asked "which of these 3?"), not as a general classifier.
const REJECTION_PATTERN =
  /\b(none(?: of (?:those|these|them))?|neither|nope|no thanks?|cannot|can(?:'|no)?t (?:make it|do (?:it|any)|attend)|won'?t work|doesn'?t work|don'?t work|not (?:good|working|ok|okay|available|free|able))\b/i;

/**
 * Resolves which offered candidate the client picked, from either the
 * channel-provided `quickReplyId` (the primary path — a tapped list/button
 * reply) or free-text ordinal phrasing ("I'll take the 2nd one").
 */
export function resolveSlotSelection(params: {
  candidates: BookingCandidate[];
  quickReplyId?: string;
  text?: string;
}): BookingCandidate | undefined {
  if (params.quickReplyId) {
    const byId = params.candidates.find((c) => c.id === params.quickReplyId);
    if (byId) return byId;
  }

  if (params.text) {
    const lower = params.text.toLowerCase();
    const index = ORDINAL_PATTERNS.find(([pattern]) => pattern.test(lower))?.[1];
    if (index !== undefined) return params.candidates[index - 1];
  }

  return undefined;
}

export function isRejectingCandidates(text: string): boolean {
  return REJECTION_PATTERN.test(text);
}

// "can" and "ok"/"okay" are idiomatic Singlish affirmatives ("can" alone,
// in reply to a yes/no question, means "yes/that works") — safe to include
// since this is only ever checked while a specific yes/no question is
// actively pending, not as a general classifier.
const AFFIRMATIVE_PATTERN = /\b(yes|yeah|yep|yup|correct|confirm(?:ed)?|can|ok(?:ay)?|sure|that'?s (?:it|right|the one))\b/i;
const NEGATIVE_PATTERN = /\b(no|nope|not (?:it|that|right|correct)|wrong)\b/i;

export function isAffirmative(text: string): boolean {
  return AFFIRMATIVE_PATTERN.test(text);
}

export function isNegative(text: string): boolean {
  return NEGATIVE_PATTERN.test(text);
}
