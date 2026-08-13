import { describe, expect, it } from "vitest";
import { parseBookingRequest } from "./booking-intent.js";
import { dayjs } from "./time.js";

// Fixed reference "now": Friday 2026-05-01, 10:00 Asia/Singapore.
const NOW = dayjs.tz("2026-05-01T10:00:00", "Asia/Singapore");

describe("parseBookingRequest — intent detection", () => {
  it("detects booking intent from keywords", () => {
    expect(parseBookingRequest("I'd like to book an appointment", NOW).hasBookingIntent).toBe(true);
    expect(parseBookingRequest("Can I make a reservation?", NOW).hasBookingIntent).toBe(true);
  });

  it("does not detect booking intent in unrelated text", () => {
    expect(parseBookingRequest("Do you sell coffee?", NOW).hasBookingIntent).toBe(false);
  });
});

describe("parseBookingRequest — relative dates", () => {
  it("parses 'today'", () => {
    expect(parseBookingRequest("today please", NOW).date).toBe("2026-05-01");
  });

  it("parses 'tomorrow'", () => {
    expect(parseBookingRequest("tomorrow please", NOW).date).toBe("2026-05-02");
  });

  it("parses a bare weekday name as the next occurrence", () => {
    // NOW is Friday; "Saturday" should resolve to the very next day.
    expect(parseBookingRequest("this Saturday", NOW).date).toBe("2026-05-02");
  });

  it("parses 'next <weekday>' as a full week later than the bare form", () => {
    const bare = parseBookingRequest("saturday", NOW).date;
    const next = parseBookingRequest("next saturday", NOW).date;
    expect(dayjs(next).diff(dayjs(bare), "day")).toBe(7);
  });
});

describe("parseBookingRequest — explicit dates", () => {
  it("parses 'day month' form", () => {
    expect(parseBookingRequest("book for 4 May", NOW).date).toBe("2026-05-04");
  });

  it("parses 'month day' form with ordinal suffix", () => {
    expect(parseBookingRequest("book for May 4th", NOW).date).toBe("2026-05-04");
  });

  it("rolls a past-this-year explicit date to next year", () => {
    // NOW is 1 May 2026; "3 Jan" has already passed this year.
    expect(parseBookingRequest("book for 3 Jan", NOW).date).toBe("2027-01-03");
  });
});

describe("parseBookingRequest — times", () => {
  it("parses 12-hour time with meridiem", () => {
    expect(parseBookingRequest("3pm works", NOW).time).toBe("15:00");
    expect(parseBookingRequest("9:30am works", NOW).time).toBe("09:30");
  });

  it("parses 12am/12pm edge cases", () => {
    expect(parseBookingRequest("12am", NOW).time).toBe("00:00");
    expect(parseBookingRequest("12pm", NOW).time).toBe("12:00");
  });

  it("parses 24-hour time", () => {
    expect(parseBookingRequest("15:00 works", NOW).time).toBe("15:00");
  });

  it("returns undefined date/time when none mentioned", () => {
    const parsed = parseBookingRequest("I'd like to book a slot", NOW);
    expect(parsed.date).toBeUndefined();
    expect(parsed.time).toBeUndefined();
  });
});
