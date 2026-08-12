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

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  one: 1,
  "1st": 1,
  second: 2,
  two: 2,
  "2nd": 2,
  third: 3,
  three: 3,
  "3rd": 3,
};

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
    const digitMatch = lower.match(/\b([123])\b/);
    const index = digitMatch
      ? Number(digitMatch[1])
      : Object.entries(ORDINAL_WORDS).find(([word]) => new RegExp(`\\b${word}\\b`).test(lower))?.[1];
    if (index !== undefined) return params.candidates[index - 1];
  }

  return undefined;
}

export function isRejectingCandidates(text: string): boolean {
  return REJECTION_PATTERN.test(text);
}
