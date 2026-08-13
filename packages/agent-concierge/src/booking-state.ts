import type { AvailabilitySlot } from "@gracesoft-sentinel/core";
import { inBusinessTz } from "./time.js";

export interface BookingCandidate {
  id: string;
  start: string;
  end: string;
}

/** Shape agent-concierge owns within `ConversationState.context`. */
export interface ConciergeContext {
  bookingCandidates?: BookingCandidate[];
  lastEscalatedMessage?: string;
  [key: string]: unknown;
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

const REJECTION_PATTERN = /\b(none|neither|nope|no thanks|doesn't work|don't work|not (?:good|working|ok|available))\b/i;

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
