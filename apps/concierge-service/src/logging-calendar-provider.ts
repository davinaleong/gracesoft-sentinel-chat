import type { AvailabilitySlot, Booking, BusinessHours, CalendarProvider, CreateBookingInput, GetAvailabilityInput, GetBusinessHoursInput } from "@gracesoft-sentinel/core";
import type { ConversationLogger } from "@gracesoft-sentinel/logging-postgres";

/**
 * Wraps a `CalendarProvider` so every successful `createBooking` is also
 * logged via `ConversationLogger.logBooking` — a decorator rather than
 * baking logging into `GoogleCalendarProvider` itself, since booking
 * records need the session id, which only the composition layer (this
 * service) has in scope.
 */
export function withBookingLogging(inner: CalendarProvider, logger: ConversationLogger, sessionId: string): CalendarProvider {
  return {
    getAvailability(input: GetAvailabilityInput): Promise<AvailabilitySlot[]> {
      return inner.getAvailability(input);
    },
    async createBooking(input: CreateBookingInput): Promise<Booking> {
      const booking = await inner.createBooking(input);
      try {
        await logger.logBooking({
          sessionId,
          bookingId: booking.id,
          calendarId: input.calendarId,
          start: booking.start,
          end: booking.end,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("[concierge-service] failed to log booking:", err);
      }
      return booking;
    },
    getBusinessHours(input: GetBusinessHoursInput): Promise<BusinessHours> {
      return inner.getBusinessHours(input);
    },
  };
}
