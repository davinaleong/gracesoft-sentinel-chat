import { describe, expect, it } from "vitest";
import type { CalendarProvider, CreateBookingInput } from "./calendar-provider.js";
import { AvailabilitySlotSchema, BookingSchema, BusinessHoursSchema } from "./calendar-provider.js";

/**
 * Shared contract test suite for `CalendarProvider` implementations.
 *
 * Deliberately kept out of `calendar-provider.ts` (and out of the package's
 * main entry point) — see `channel-adapter-contract.ts` for why. Import
 * this only from `@gracesoft-sentinel/core/testing`.
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
