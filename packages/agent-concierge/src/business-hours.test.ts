import { describe, expect, it } from "vitest";
import type { BusinessHours } from "@gracesoft-sentinel/core";
import { isWithinHours, resolveDayHours, weekdayOf, withTimeOfDay } from "./business-hours.js";
import { dayjs, type Dayjs } from "./time.js";

const businessHours: BusinessHours = {
  timezone: "Asia/Singapore",
  weekly: {
    mon: { open: "09:00", close: "18:00" },
    tue: { open: "09:00", close: "18:00" },
    wed: { open: "09:00", close: "18:00" },
    thu: { open: "09:00", close: "18:00" },
    fri: { open: "09:00", close: "18:00" },
    sat: { open: "09:00", close: "13:00" },
    sun: null,
  },
  exceptions: [{ date: "2026-05-02", hours: null, reason: "Public holiday" }],
};

function at(dateStr: string): Dayjs {
  return dayjs.tz(dateStr, "Asia/Singapore");
}

describe("weekdayOf", () => {
  it("maps a date to the correct weekday key", () => {
    // 2026-05-01 is a Friday.
    expect(weekdayOf(at("2026-05-01"))).toBe("fri");
    // 2026-05-02 is a Saturday.
    expect(weekdayOf(at("2026-05-02"))).toBe("sat");
    // 2026-05-03 is a Sunday.
    expect(weekdayOf(at("2026-05-03"))).toBe("sun");
  });
});

describe("resolveDayHours", () => {
  it("returns the weekly hours for a normal business day", () => {
    expect(resolveDayHours(businessHours, at("2026-05-01"))).toEqual({ open: "09:00", close: "18:00" });
  });

  it("returns null for a weekday closed in the weekly map", () => {
    expect(resolveDayHours(businessHours, at("2026-05-03"))).toBeNull();
  });

  it("a dated exception always wins over the weekly map (2 May excluded)", () => {
    // 2026-05-02 is a Saturday, which the weekly map says is open 09:00-13:00 —
    // the exception must override that, not be shadowed by it.
    expect(resolveDayHours(businessHours, at("2026-05-02"))).toBeNull();
  });

  it("does not mutate the weekly map when resolving an exception", () => {
    resolveDayHours(businessHours, at("2026-05-02"));
    expect(businessHours.weekly.sat).toEqual({ open: "09:00", close: "13:00" });
  });
});

describe("withTimeOfDay", () => {
  it("sets hour/minute and zeroes seconds/millis, preserving the date", () => {
    const result = withTimeOfDay(at("2026-05-01"), "14:30");
    expect(result.format("YYYY-MM-DD HH:mm:ss")).toBe("2026-05-01 14:30:00");
  });
});

describe("isWithinHours", () => {
  const hours = { open: "09:00", close: "18:00" };

  it("is true at the opening boundary", () => {
    expect(isWithinHours(withTimeOfDay(at("2026-05-01"), "09:00"), hours)).toBe(true);
  });

  it("is true at the closing boundary", () => {
    expect(isWithinHours(withTimeOfDay(at("2026-05-01"), "18:00"), hours)).toBe(true);
  });

  it("is false before opening", () => {
    expect(isWithinHours(withTimeOfDay(at("2026-05-01"), "08:59"), hours)).toBe(false);
  });

  it("is false after closing", () => {
    expect(isWithinHours(withTimeOfDay(at("2026-05-01"), "18:01"), hours)).toBe(false);
  });
});
