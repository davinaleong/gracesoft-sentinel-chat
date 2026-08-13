import type {
  AvailabilitySlot,
  Booking,
  BusinessConfig,
  BusinessHours,
  CalendarProvider,
  CreateBookingInput,
  GetAvailabilityInput,
  GetBusinessHoursInput,
} from "@gracesoft-sentinel/core";
import type { FaqEntry } from "./faq-matcher.js";

/**
 * Mirrors the `testing.md` regression scenario: Mon-Fri 09:00-18:00,
 * Sat 09:00-13:00, Sun closed, with 2 May carved out as a public-holiday
 * exception so the weekly Saturday hours never apply to it.
 */
export const TEST_BUSINESS_HOURS: BusinessHours = {
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

export const TEST_BUSINESS_CONFIG: BusinessConfig = {
  businessId: "test-biz",
  timezone: "Asia/Singapore",
  faqBlueprintPath: "./fixtures/faq.json",
  calendarId: "test-calendar",
  businessHours: TEST_BUSINESS_HOURS,
};

export const TEST_FAQ_BLUEPRINT: FaqEntry[] = [
  {
    id: "faq-hours",
    question: "What are your opening hours?",
    answer: "We're open Monday to Friday 9am-6pm and Saturday 9am-1pm.",
    keywords: ["opening", "hours", "open", "close", "time"],
  },
  {
    id: "faq-location",
    question: "Where are you located?",
    answer: "We're at 123 Example Street, Singapore.",
    keywords: ["location", "address", "where", "directions"],
  },
];

class RecordingCalendarProvider implements CalendarProvider {
  public createBookingCalls: CreateBookingInput[] = [];
  private nextId = 1;

  constructor(
    private readonly busyWindows: { start: string; end: string }[] = [],
    private readonly businessHours: BusinessHours = TEST_BUSINESS_HOURS
  ) {}

  async getAvailability(input: GetAvailabilityInput): Promise<AvailabilitySlot[]> {
    const from = new Date(input.from).getTime();
    const to = new Date(input.to).getTime();
    if (from >= to) return [];

    const busyInRange = this.busyWindows
      .map((w) => ({ start: new Date(w.start).getTime(), end: new Date(w.end).getTime() }))
      .filter((w) => w.end > from && w.start < to)
      .sort((a, b) => a.start - b.start);

    const free: AvailabilitySlot[] = [];
    let cursor = from;
    for (const busy of busyInRange) {
      if (busy.start > cursor) {
        free.push({ start: new Date(cursor).toISOString(), end: new Date(busy.start).toISOString() });
      }
      cursor = Math.max(cursor, busy.end);
    }
    if (cursor < to) {
      free.push({ start: new Date(cursor).toISOString(), end: new Date(to).toISOString() });
    }
    return free;
  }

  async createBooking(input: CreateBookingInput): Promise<Booking> {
    this.createBookingCalls.push(input);
    return { id: `booking-${this.nextId++}`, start: input.start, end: input.end };
  }

  async getBusinessHours(_input: GetBusinessHoursInput): Promise<BusinessHours> {
    return this.businessHours;
  }
}

/** A calendar with no bookings on it at all — every business-hours slot is free. */
export function fullyAvailableCalendarProvider(): RecordingCalendarProvider {
  return new RecordingCalendarProvider([]);
}

/** A calendar that's busy for the given ISO windows, free everywhere else. */
export function calendarWithBusyWindows(
  busyWindows: { start: string; end: string }[]
): RecordingCalendarProvider {
  return new RecordingCalendarProvider(busyWindows);
}

export type { RecordingCalendarProvider };
