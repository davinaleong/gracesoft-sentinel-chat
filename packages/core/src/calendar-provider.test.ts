import { describe, expect, it } from "vitest";
import type {
  AvailabilitySlot,
  Booking,
  BusinessHours,
  CalendarProvider,
  CreateBookingInput,
  FindBookingByAppointmentIdInput,
  GetAvailabilityInput,
  GetBusinessHoursInput,
  UpdateBookingInput,
} from "./calendar-provider.js";
import { BusinessHoursSchema } from "./calendar-provider.js";
import { runCalendarProviderContractTests } from "./calendar-provider-contract.js";

/**
 * Trivial in-memory provider, used only to prove the contract suite itself
 * is correct. The real Google Calendar-backed provider is wired up in
 * Milestone 5.
 */
class FakeCalendarProvider implements CalendarProvider {
  private nextId = 1;
  private readonly bookings = new Map<string, Booking>();

  async getAvailability(input: GetAvailabilityInput): Promise<AvailabilitySlot[]> {
    return [{ start: input.from, end: input.to }];
  }

  async createBooking(input: CreateBookingInput): Promise<Booking> {
    const booking: Booking = { id: `booking-${this.nextId++}`, appointmentId: input.appointmentId, start: input.start, end: input.end };
    this.bookings.set(booking.id, booking);
    return booking;
  }

  async findBookingByAppointmentId(input: FindBookingByAppointmentIdInput): Promise<Booking | null> {
    for (const booking of this.bookings.values()) {
      if (booking.appointmentId === input.appointmentId) return booking;
    }
    return null;
  }

  async updateBooking(input: UpdateBookingInput): Promise<Booking> {
    const existing = this.bookings.get(input.id);
    if (!existing) throw new Error(`No booking with id ${input.id}`);
    const updated: Booking = { ...existing, start: input.start, end: input.end };
    this.bookings.set(updated.id, updated);
    return updated;
  }

  async getBusinessHours(_input: GetBusinessHoursInput): Promise<BusinessHours> {
    return {
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
  }
}

runCalendarProviderContractTests("FakeCalendarProvider (self-test)", () => new FakeCalendarProvider());

describe("BusinessHoursSchema exceptions", () => {
  it("represents a non-business day as a dated exception, not a weekly-map mutation", async () => {
    const provider = new FakeCalendarProvider();
    const hours = await provider.getBusinessHours({ calendarId: "test" });
    const result = BusinessHoursSchema.safeParse(hours);
    expect(result.success).toBe(true);

    const exception = hours.exceptions.find((e) => e.date === "2026-05-02");
    expect(exception?.hours).toBeNull();
    // The weekly map itself is untouched — Friday still has normal hours.
    expect(hours.weekly.fri).toEqual({ open: "09:00", close: "18:00" });
  });
});
