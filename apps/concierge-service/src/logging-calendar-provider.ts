import type {
  AvailabilitySlot,
  Booking,
  BusinessHours,
  CalendarProvider,
  CancelBookingInput,
  CreateBookingInput,
  FindBookingByAppointmentIdInput,
  GetAvailabilityInput,
  GetBusinessHoursInput,
  UpdateBookingInput,
} from "@gracesoft-sentinel/core";
import type { Logger } from "@gracesoft-sentinel/logging";
import type { ConversationLogger } from "@gracesoft-sentinel/logging-postgres";

/**
 * Wraps a `CalendarProvider` so every successful `createBooking` is also
 * logged via `ConversationLogger.logBooking` — a decorator rather than
 * baking logging into `GoogleCalendarProvider` itself, since booking
 * records need the session id, which only the composition layer (this
 * service) has in scope.
 */
export function withBookingLogging(
  inner: CalendarProvider,
  conversationLogger: ConversationLogger,
  sessionId: string,
  appLogger: Logger
): CalendarProvider {
  return {
    getAvailability(input: GetAvailabilityInput): Promise<AvailabilitySlot[]> {
      return inner.getAvailability(input);
    },
    async createBooking(input: CreateBookingInput): Promise<Booking> {
      const booking = await inner.createBooking(input);
      try {
        await conversationLogger.logBooking({
          sessionId,
          bookingId: booking.id,
          calendarId: input.calendarId,
          start: booking.start,
          end: booking.end,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        appLogger.error({ err, sessionId, bookingId: booking.id }, "failed to log booking");
      }
      return booking;
    },
    findBookingByAppointmentId(input: FindBookingByAppointmentIdInput): Promise<Booking | null> {
      return inner.findBookingByAppointmentId(input);
    },
    async updateBooking(input: UpdateBookingInput): Promise<Booking> {
      const booking = await inner.updateBooking(input);
      try {
        // Same shape/table as a create — an append-only audit trail where a
        // reschedule is just another row against the same bookingId, not a
        // mutation of the original.
        await conversationLogger.logBooking({
          sessionId,
          bookingId: booking.id,
          calendarId: input.calendarId,
          start: booking.start,
          end: booking.end,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        appLogger.error({ err, sessionId, bookingId: booking.id }, "failed to log rescheduled booking");
      }
      return booking;
    },
    getBusinessHours(input: GetBusinessHoursInput): Promise<BusinessHours> {
      return inner.getBusinessHours(input);
    },
    cancelBooking(input: CancelBookingInput): Promise<void> {
      return inner.cancelBooking(input);
    },
  };
}
