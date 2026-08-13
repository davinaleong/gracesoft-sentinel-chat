import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLOT_DURATION_MINUTES,
  findNextAvailableSlots,
  generateCandidateSlotStarts,
  isSlotAvailable,
} from "./slot-engine.js";
import { calendarWithBusyWindows, fullyAvailableCalendarProvider, TEST_BUSINESS_HOURS } from "./test-support.js";
import { dayjs, type Dayjs } from "./time.js";

function at(dateStr: string): Dayjs {
  return dayjs.tz(dateStr, "Asia/Singapore");
}

describe("generateCandidateSlotStarts", () => {
  it("skips a dated exception and a weekly-closed day, rolling over to the next business day (2 May excluded -> 4 May)", () => {
    const candidates = generateCandidateSlotStarts({
      businessHours: TEST_BUSINESS_HOURS,
      from: at("2026-05-02T00:00:00"),
      horizonDays: 5,
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]!.format("YYYY-MM-DD HH:mm")).toBe("2026-05-04 09:00");
    // No candidate should ever land on the excluded Saturday or the closed Sunday.
    for (const c of candidates) {
      expect(c.format("YYYY-MM-DD")).not.toBe("2026-05-02");
      expect(c.format("YYYY-MM-DD")).not.toBe("2026-05-03");
    }
  });

  it("on the first day, only offers slots at or after `from`, rounded up to the step", () => {
    const candidates = generateCandidateSlotStarts({
      businessHours: TEST_BUSINESS_HOURS,
      from: at("2026-05-01T10:07:00"), // Friday, mid-morning
      horizonDays: 0,
    });
    expect(candidates[0]!.format("HH:mm")).toBe("10:30");
  });

  it("does not offer a slot that would run past closing time", () => {
    const candidates = generateCandidateSlotStarts({
      businessHours: TEST_BUSINESS_HOURS,
      from: at("2026-05-01T00:00:00"),
      horizonDays: 0,
      slotDurationMinutes: 30,
    });
    const last = candidates[candidates.length - 1]!;
    expect(last.add(30, "minute").format("HH:mm")).toBe("18:00");
  });
});

describe("isSlotAvailable", () => {
  it("is true when the calendar reports the exact window as free", async () => {
    const provider = fullyAvailableCalendarProvider();
    const start = at("2026-05-01T10:00:00");
    const end = start.add(DEFAULT_SLOT_DURATION_MINUTES, "minute");
    const available = await isSlotAvailable({
      calendarProvider: provider,
      calendarId: "test-calendar",
      start,
      end,
      timezone: "Asia/Singapore",
    });
    expect(available).toBe(true);
  });

  it("is false when the window overlaps a busy block", async () => {
    const start = at("2026-05-01T10:00:00");
    const end = start.add(DEFAULT_SLOT_DURATION_MINUTES, "minute");
    const provider = calendarWithBusyWindows([{ start: start.toISOString(), end: end.toISOString() }]);
    const available = await isSlotAvailable({
      calendarProvider: provider,
      calendarId: "test-calendar",
      start,
      end,
      timezone: "Asia/Singapore",
    });
    expect(available).toBe(false);
  });
});

describe("findNextAvailableSlots", () => {
  it("returns the requested count of business-hours-aware, chronologically ordered slots", async () => {
    const provider = fullyAvailableCalendarProvider();
    const slots = await findNextAvailableSlots({
      calendarProvider: provider,
      calendarId: "test-calendar",
      businessHours: TEST_BUSINESS_HOURS,
      timezone: "Asia/Singapore",
      from: at("2026-05-01T08:00:00"),
      count: 3,
    });
    expect(slots).toHaveLength(3);
    const starts = slots.map((s) => new Date(s.start).getTime());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("only offers slots the calendar provider actually reports as free", async () => {
    const from = at("2026-05-01T09:00:00");
    // Block out the first two 30-minute slots of the day.
    const provider = calendarWithBusyWindows([
      { start: from.toISOString(), end: from.add(60, "minute").toISOString() },
    ]);
    const slots = await findNextAvailableSlots({
      calendarProvider: provider,
      calendarId: "test-calendar",
      businessHours: TEST_BUSINESS_HOURS,
      timezone: "Asia/Singapore",
      from,
      count: 1,
    });
    expect(slots[0]!.start).toBe(from.add(60, "minute").toISOString());
  });

  it("regression: 2 May excluded correctly, rollover lands on 4 May, not the closed dates", async () => {
    const provider = fullyAvailableCalendarProvider();
    const slots = await findNextAvailableSlots({
      calendarProvider: provider,
      calendarId: "test-calendar",
      businessHours: TEST_BUSINESS_HOURS,
      timezone: "Asia/Singapore",
      from: at("2026-05-02T00:00:00"),
      count: 3,
    });
    expect(slots.length).toBeGreaterThan(0);
    const firstStart = dayjs(slots[0]!.start).tz("Asia/Singapore");
    expect(firstStart.format("YYYY-MM-DD HH:mm")).toBe("2026-05-04 09:00");
  });
});
