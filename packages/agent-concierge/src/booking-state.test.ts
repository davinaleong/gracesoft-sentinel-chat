import { describe, expect, it } from "vitest";
import type { AvailabilitySlot, ConversationState } from "@gracesoft-sentinel/core";
import {
  bookingsMadeToday,
  formatSlotLabel,
  incrementBookingsToday,
  isAffirmative,
  isNegative,
  isRejectingCandidates,
  resolveSlotSelection,
  toBookingCandidates,
  withContext,
  type ConciergeContext,
} from "./booking-state.js";
import { dayjs } from "./time.js";

const SLOTS: AvailabilitySlot[] = [
  { start: "2026-05-04T09:00:00+08:00", end: "2026-05-04T09:30:00+08:00" },
  { start: "2026-05-04T10:00:00+08:00", end: "2026-05-04T10:30:00+08:00" },
  { start: "2026-05-04T11:00:00+08:00", end: "2026-05-04T11:30:00+08:00" },
];

describe("toBookingCandidates", () => {
  it("assigns stable, ordered ids to each slot", () => {
    const candidates = toBookingCandidates(SLOTS);
    expect(candidates.map((c) => c.id)).toEqual(["slot-1", "slot-2", "slot-3"]);
    expect(candidates[1]!.start).toBe(SLOTS[1]!.start);
  });
});

describe("formatSlotLabel", () => {
  it("renders a human-readable label in the business timezone", () => {
    const label = formatSlotLabel("2026-05-04T09:00:00+08:00", "Asia/Singapore");
    expect(label).toBe("Mon, 4 May, 9:00am");
  });
});

describe("resolveSlotSelection", () => {
  const candidates = toBookingCandidates(SLOTS);

  it("resolves via quickReplyId when present", () => {
    const selected = resolveSlotSelection({ candidates, quickReplyId: "slot-2" });
    expect(selected?.id).toBe("slot-2");
  });

  it("resolves via a digit ordinal in free text", () => {
    const selected = resolveSlotSelection({ candidates, text: "I'll take the 2nd one" });
    expect(selected?.id).toBe("slot-2");
  });

  it("resolves via a spelled-out ordinal word", () => {
    const selected = resolveSlotSelection({ candidates, text: "the second please" });
    expect(selected?.id).toBe("slot-2");
  });

  it("resolves via a bare number word", () => {
    const selected = resolveSlotSelection({ candidates, text: "three" });
    expect(selected?.id).toBe("slot-3");
  });

  it("returns undefined when nothing matches", () => {
    const selected = resolveSlotSelection({ candidates, text: "hmm not sure" });
    expect(selected).toBeUndefined();
  });

  it("prefers quickReplyId over text when both are present", () => {
    const selected = resolveSlotSelection({ candidates, quickReplyId: "slot-1", text: "the 2nd one" });
    expect(selected?.id).toBe("slot-1");
  });
});

describe("isRejectingCandidates", () => {
  it("recognises common rejection phrasings", () => {
    expect(isRejectingCandidates("none of these work")).toBe(true);
    expect(isRejectingCandidates("nope")).toBe(true);
    expect(isRejectingCandidates("doesn't work for me")).toBe(true);
    expect(isRejectingCandidates("not available on those days")).toBe(true);
  });

  it("does not flag an acceptance or unrelated text as a rejection", () => {
    expect(isRejectingCandidates("the second one works great")).toBe(false);
    expect(isRejectingCandidates("what time do you close")).toBe(false);
  });

  it("recognizes natural phrasing beyond the original fixed word list", () => {
    expect(isRejectingCandidates("i can't make it for any of those slots")).toBe(true);
    expect(isRejectingCandidates("that won't work for me")).toBe(true);
  });
});

describe("isAffirmative / isNegative", () => {
  it("recognizes common yes/no phrasings", () => {
    expect(isAffirmative("yes that's the one")).toBe(true);
    expect(isAffirmative("yep, confirm")).toBe(true);
    expect(isNegative("no, wrong one")).toBe(true);
    expect(isNegative("nope")).toBe(true);
  });

  it("doesn't cross-classify", () => {
    expect(isAffirmative("no thanks")).toBe(false);
    expect(isNegative("yes please")).toBe(false);
  });
});

function makeState(context: Record<string, unknown> = {}): ConversationState {
  return {
    sessionId: "s",
    channel: "whatsapp",
    userId: "u",
    agent: "concierge",
    createdAt: "2026-05-01T09:00:00+08:00",
    updatedAt: "2026-05-01T09:00:00+08:00",
    context,
  };
}

describe("withContext", () => {
  it("merges a patch onto the existing context rather than replacing it", () => {
    const state = makeState({ aiDisclosed: true, lastAppointmentId: "GS-AAAA-1111" });
    const result = withContext(state, { bookingCandidates: [{ id: "slot-1", start: "s", end: "e" }] });
    const context = result.context as ConciergeContext;
    expect(context.aiDisclosed).toBe(true);
    expect(context.lastAppointmentId).toBe("GS-AAAA-1111");
    expect(context.bookingCandidates).toHaveLength(1);
  });

  it("clears a field only when the patch explicitly sets it to undefined", () => {
    const state = makeState({ bookingCandidates: [{ id: "slot-1", start: "s", end: "e" }], aiDisclosed: true });
    const result = withContext(state, { bookingCandidates: undefined });
    const context = result.context as ConciergeContext;
    expect(context.bookingCandidates).toBeUndefined();
    expect(context.aiDisclosed).toBe(true);
  });
});

describe("bookingsMadeToday / incrementBookingsToday", () => {
  const today = dayjs.tz("2026-05-04T10:00:00", "Asia/Singapore");

  it("is 0 when no counter has been set yet", () => {
    expect(bookingsMadeToday({}, today)).toBe(0);
  });

  it("increments within the same day", () => {
    let context: ConciergeContext = {};
    context = { bookingsToday: incrementBookingsToday(context, today) };
    context = { bookingsToday: incrementBookingsToday(context, today) };
    expect(bookingsMadeToday(context, today)).toBe(2);
  });

  it("resets on a new day rather than accumulating forever", () => {
    const context: ConciergeContext = { bookingsToday: { date: "2026-05-03", count: 5 } };
    expect(bookingsMadeToday(context, today)).toBe(0);
  });
});
