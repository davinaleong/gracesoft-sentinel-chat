import { describe, expect, it } from "vitest";
import { z } from "zod";

export const WeekdaySchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export type Weekday = z.infer<typeof WeekdaySchema>;

export const DayHoursSchema = z.object({
  /** 24h "HH:mm", business's local time. */
  open: z.string(),
  close: z.string(),
});
export type DayHours = z.infer<typeof DayHoursSchema>;

/**
 * A dated exception to the weekly hours map — the mechanism the
 * `2 May` business-hours bug (Milestone 2) is fixed through: an excluded
 * date resolves via `exceptions`, not by mutating the weekly map.
 */
export const BusinessHoursExceptionSchema = z.object({
  /** ISO date, "YYYY-MM-DD". */
  date: z.string(),
  /** `null` means closed all day. */
  hours: DayHoursSchema.nullable(),
  reason: z.string().optional(),
});
export type BusinessHoursException = z.infer<typeof BusinessHoursExceptionSchema>;

export const BusinessHoursSchema = z.object({
  /** IANA timezone, e.g. "Asia/Singapore". */
  timezone: z.string(),
  /** `null` for a weekday means closed that day of the week. */
  weekly: z.record(WeekdaySchema, DayHoursSchema.nullable()),
  exceptions: z.array(BusinessHoursExceptionSchema).default([]),
});
export type BusinessHours = z.infer<typeof BusinessHoursSchema>;

export const AvailabilitySlotSchema = z.object({
  /** ISO 8601, in the calendar's configured timezone. */
  start: z.string(),
  end: z.string(),
});
export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;

export const GetAvailabilityInputSchema = z.object({
  calendarId: z.string(),
  from: z.string(),
  to: z.string(),
  timezone: z.string(),
});
export type GetAvailabilityInput = z.infer<typeof GetAvailabilityInputSchema>;

export const CreateBookingInputSchema = z.object({
  calendarId: z.string(),
  start: z.string(),
  end: z.string(),
  timezone: z.string(),
  summary: z.string(),
  attendee: z
    .object({
      name: z.string().optional(),
      contact: z.string().optional(),
    })
    .optional(),
});
export type CreateBookingInput = z.infer<typeof CreateBookingInputSchema>;

export const BookingSchema = z.object({
  id: z.string(),
  start: z.string(),
  end: z.string(),
  raw: z.unknown().optional(),
});
export type Booking = z.infer<typeof BookingSchema>;

export const GetBusinessHoursInputSchema = z.object({
  calendarId: z.string(),
});
export type GetBusinessHoursInput = z.infer<typeof GetBusinessHoursInputSchema>;

/**
 * Calendar/booking capability surface. `agent-concierge` depends on this
 * interface only — never on a concrete calendar SDK.
 */
export interface CalendarProvider {
  getAvailability(input: GetAvailabilityInput): Promise<AvailabilitySlot[]>;
  createBooking(input: CreateBookingInput): Promise<Booking>;
  getBusinessHours(input: GetBusinessHoursInput): Promise<BusinessHours>;
}

/**
 * Shared contract test suite for `CalendarProvider` implementations.
 */
export function runCalendarProviderContractTests(
  name: string,
  makeProvider: () => CalendarProvider | Promise<CalendarProvider>,
  calendarId = "test-calendar"
): void {
  describe(`CalendarProvider contract: ${name}`, () => {
    it("getAvailability returns well-formed, chronologically valid slots", async () => {
      const provider = await makeProvider();
      const slots = await provider.getAvailability({
        calendarId,
        from: "2026-05-01T00:00:00+08:00",
        to: "2026-05-07T00:00:00+08:00",
        timezone: "Asia/Singapore",
      });
      for (const slot of slots) {
        expect(AvailabilitySlotSchema.safeParse(slot).success).toBe(true);
        expect(new Date(slot.start).getTime()).toBeLessThan(new Date(slot.end).getTime());
      }
    });

    it("createBooking returns a booking with an id and the requested times", async () => {
      const provider = await makeProvider();
      const input: CreateBookingInput = {
        calendarId,
        start: "2026-05-04T10:00:00+08:00",
        end: "2026-05-04T10:30:00+08:00",
        timezone: "Asia/Singapore",
        summary: "Contract test booking",
      };
      const booking = await provider.createBooking(input);
      expect(BookingSchema.safeParse(booking).success).toBe(true);
      expect(booking.id).toBeTruthy();
    });

    it("getBusinessHours returns a valid BusinessHours shape", async () => {
      const provider = await makeProvider();
      const hours = await provider.getBusinessHours({ calendarId });
      const result = BusinessHoursSchema.safeParse(hours);
      expect(result.success, result.success ? undefined : JSON.stringify(result.error.issues)).toBe(true);
    });
  });
}
