import { describe, expect, it } from "vitest";
import { withBookingLogging } from "./logging-calendar-provider.js";
import { FakeCalendarProvider, FakeConversationLogger, createSilentTestLogger } from "./test-support.js";

describe("withBookingLogging", () => {
  it("logs a booking after a successful createBooking, with the given sessionId", async () => {
    const inner = new FakeCalendarProvider();
    const logger = new FakeConversationLogger();
    const wrapped = withBookingLogging(inner, logger, "session-123", createSilentTestLogger());

    const booking = await wrapped.createBooking({
      calendarId: "cal-1",
      start: "2026-05-04T01:00:00.000Z",
      end: "2026-05-04T01:30:00.000Z",
      timezone: "Asia/Singapore",
      summary: "GS-AAAA-1111 whatsapp",
      appointmentId: "GS-AAAA-1111",
    });

    expect(inner.createBookingCalls).toHaveLength(1);
    expect(logger.bookings).toHaveLength(1);
    expect(logger.bookings[0]).toMatchObject({
      sessionId: "session-123",
      bookingId: booking.id,
      calendarId: "cal-1",
      start: "2026-05-04T01:00:00.000Z",
      end: "2026-05-04T01:30:00.000Z",
    });
  });

  it("does not log when createBooking throws, and the error still propagates", async () => {
    const inner = new FakeCalendarProvider();
    inner.createBooking = async () => {
      throw new Error("calendar API down");
    };
    const logger = new FakeConversationLogger();
    const wrapped = withBookingLogging(inner, logger, "session-123", createSilentTestLogger());

    await expect(
      wrapped.createBooking({ calendarId: "cal-1", start: "x", end: "y", timezone: "Asia/Singapore", summary: "s", appointmentId: "GS-AAAA-1111" })
    ).rejects.toThrow("calendar API down");
    expect(logger.bookings).toHaveLength(0);
  });

  it("passes getAvailability, getBusinessHours, and findBookingByAppointmentId straight through", async () => {
    const inner = new FakeCalendarProvider();
    const logger = new FakeConversationLogger();
    const wrapped = withBookingLogging(inner, logger, "session-123", createSilentTestLogger());

    const slots = await wrapped.getAvailability({ calendarId: "cal-1", from: "a", to: "b", timezone: "Asia/Singapore" });
    expect(slots).toEqual([{ start: "a", end: "b" }]);

    const hours = await wrapped.getBusinessHours({ calendarId: "cal-1" });
    expect(hours.timezone).toBe("Asia/Singapore");

    const notFound = await wrapped.findBookingByAppointmentId({ calendarId: "cal-1", appointmentId: "GS-NEVER-0000" });
    expect(notFound).toBeNull();
  });

  it("logs a booking after a successful updateBooking, same as a create", async () => {
    const inner = new FakeCalendarProvider();
    const logger = new FakeConversationLogger();
    const wrapped = withBookingLogging(inner, logger, "session-123", createSilentTestLogger());

    const created = await wrapped.createBooking({
      calendarId: "cal-1",
      start: "2026-05-04T01:00:00.000Z",
      end: "2026-05-04T01:30:00.000Z",
      timezone: "Asia/Singapore",
      summary: "GS-AAAA-1111 whatsapp",
      appointmentId: "GS-AAAA-1111",
    });

    const updated = await wrapped.updateBooking({
      calendarId: "cal-1",
      id: created.id,
      start: "2026-05-05T01:00:00.000Z",
      end: "2026-05-05T01:30:00.000Z",
      timezone: "Asia/Singapore",
    });

    expect(logger.bookings).toHaveLength(2);
    expect(logger.bookings[1]).toMatchObject({
      sessionId: "session-123",
      bookingId: updated.id,
      calendarId: "cal-1",
      start: "2026-05-05T01:00:00.000Z",
      end: "2026-05-05T01:30:00.000Z",
    });
  });
});
