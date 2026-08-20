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

    it("createBooking returns a booking with an id, echoing the requested appointmentId and times", async () => {
      const provider = await makeProvider();
      const input: CreateBookingInput = {
        calendarId,
        start: "2026-05-04T10:00:00+08:00",
        end: "2026-05-04T10:30:00+08:00",
        timezone: "Asia/Singapore",
        summary: "Contract test booking",
        appointmentId: "GS-TEST-0001",
      };
      const booking = await provider.createBooking(input);
      expect(BookingSchema.safeParse(booking).success).toBe(true);
      expect(booking.id).toBeTruthy();
      expect(booking.appointmentId).toBe("GS-TEST-0001");
    });

    it("getBusinessHours returns a valid BusinessHours shape", async () => {
      const provider = await makeProvider();
      const hours = await provider.getBusinessHours({ calendarId });
      const result = BusinessHoursSchema.safeParse(hours);
      expect(result.success, result.success ? undefined : JSON.stringify(result.error.issues)).toBe(true);
    });

    it("findBookingByAppointmentId returns null for an appointment id that was never booked", async () => {
      const provider = await makeProvider();
      const result = await provider.findBookingByAppointmentId({ calendarId, appointmentId: "GS-NEVER-EXISTED" });
      expect(result).toBeNull();
    });

    it("findBookingByAppointmentId finds a booking created with that appointmentId", async () => {
      const provider = await makeProvider();
      const created = await provider.createBooking({
        calendarId,
        start: "2026-05-05T10:00:00+08:00",
        end: "2026-05-05T10:30:00+08:00",
        timezone: "Asia/Singapore",
        summary: "Findable booking",
        appointmentId: "GS-FIND-0002",
      });
      const found = await provider.findBookingByAppointmentId({ calendarId, appointmentId: "GS-FIND-0002" });
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.appointmentId).toBe("GS-FIND-0002");
    });

    it("updateBooking moves an existing booking to a new time, preserving its appointmentId", async () => {
      const provider = await makeProvider();
      const created = await provider.createBooking({
        calendarId,
        start: "2026-05-06T10:00:00+08:00",
        end: "2026-05-06T10:30:00+08:00",
        timezone: "Asia/Singapore",
        summary: "Reschedulable booking",
        appointmentId: "GS-MOVE-0003",
      });
      const updated = await provider.updateBooking({
        calendarId,
        id: created.id,
        start: "2026-05-07T14:00:00+08:00",
        end: "2026-05-07T14:30:00+08:00",
        timezone: "Asia/Singapore",
      });
      expect(updated.id).toBe(created.id);
      expect(updated.appointmentId).toBe("GS-MOVE-0003");
      expect(new Date(updated.start).toISOString()).toBe(new Date("2026-05-07T14:00:00+08:00").toISOString());
    });
  });
}
