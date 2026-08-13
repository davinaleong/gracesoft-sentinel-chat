import { describe, expect, it } from "vitest";
import type { AvailabilitySlot } from "@gracesoft-sentinel/core";
import {
  formatSlotLabel,
  isRejectingCandidates,
  resolveSlotSelection,
  toBookingCandidates,
} from "./booking-state.js";

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
});
