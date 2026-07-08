import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import { isPublicHoliday, isWeekend } from "./holidays";

/** Available appointment hours (SGT, 24h) */
const AVAILABLE_HOURS = [9, 10, 11, 14, 15, 16];

/** Duration of each appointment slot in minutes */
const SLOT_DURATION_MINUTES = 60;

/** Singapore timezone */
const TIMEZONE = "Asia/Singapore";

export interface CalendarConfig {
  serviceAccountEmail: string;
  privateKey: string;
  calendarId: string;
}

export interface BookingResult {
  eventId: string;
  reference: string;
}

function buildAuth(config: CalendarConfig) {
  return new google.auth.JWT(
    config.serviceAccountEmail,
    undefined,
    config.privateKey.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/calendar"]
  );
}

function toSgtDate(isoDate: string, hour: number): Date {
  // Create a Date representing the given hour in SGT (UTC+8)
  const [year, month, day] = isoDate.split("-").map(Number);
  const utcHour = hour - 8; // Convert SGT to UTC
  return new Date(Date.UTC(year, month - 1, day, utcHour, 0, 0));
}

function formatTimeSlot(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour > 12 ? hour - 12 : hour;
  return `${h}:00 ${suffix}`;
}

/**
 * Returns available appointment slots (as formatted strings) for the given date.
 * Blocks out slots that overlap with existing Google Calendar events.
 */
export async function getAvailableSlots(
  isoDate: string,
  config: CalendarConfig
): Promise<string[]> {
  const date = new Date(isoDate + "T00:00:00+08:00");

  if (isWeekend(date) || isPublicHoliday(isoDate)) {
    return [];
  }

  const auth = buildAuth(config);
  const cal = google.calendar({ version: "v3", auth });

  // Query free/busy for the whole day
  const dayStart = new Date(isoDate + "T00:00:00+08:00").toISOString();
  const dayEnd = new Date(isoDate + "T23:59:59+08:00").toISOString();

  let busyPeriods: calendar_v3.Schema$TimePeriod[] = [];
  try {
    const resp = await cal.freebusy.query({
      requestBody: {
        timeMin: dayStart,
        timeMax: dayEnd,
        timeZone: TIMEZONE,
        items: [{ id: config.calendarId }],
      },
    });
    busyPeriods =
      resp.data.calendars?.[config.calendarId]?.busy ?? [];
  } catch {
    // If calendar is unreachable, return all slots (graceful degradation)
    return AVAILABLE_HOURS.map(formatTimeSlot);
  }

  // Filter out slots that overlap with busy periods
  return AVAILABLE_HOURS.filter((hour) => {
    const slotStart = toSgtDate(isoDate, hour);
    const slotEnd = new Date(
      slotStart.getTime() + SLOT_DURATION_MINUTES * 60 * 1000
    );

    return !busyPeriods.some((busy) => {
      const busyStart = new Date(busy.start!);
      const busyEnd = new Date(busy.end!);
      // Overlap check: slotStart < busyEnd && slotEnd > busyStart
      return slotStart < busyEnd && slotEnd > busyStart;
    });
  }).map(formatTimeSlot);
}

/**
 * Creates a Google Calendar event for the booking.
 * Returns the event ID and a human-readable booking reference.
 */
export async function createBooking(
  isoDate: string,
  timeSlot: string,
  userId: string,
  config: CalendarConfig
): Promise<BookingResult> {
  // Parse hour from slot string (e.g. "9:00 AM" → 9, "2:00 PM" → 14)
  const [timePart, ampm] = timeSlot.split(" ");
  let hour = parseInt(timePart.split(":")[0], 10);
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  const slotStart = toSgtDate(isoDate, hour);
  const slotEnd = new Date(
    slotStart.getTime() + SLOT_DURATION_MINUTES * 60 * 1000
  );

  const auth = buildAuth(config);
  const cal = google.calendar({ version: "v3", auth });

  const event = await cal.events.insert({
    calendarId: config.calendarId,
    requestBody: {
      summary: "Sentinel Concierge Appointment",
      description: `Booked via Sentinel by user: ${userId}`,
      start: { dateTime: slotStart.toISOString(), timeZone: TIMEZONE },
      end: { dateTime: slotEnd.toISOString(), timeZone: TIMEZONE },
    },
  });

  const eventId = event.data.id ?? "unknown";
  const reference = `SENT-${isoDate.replace(/-/g, "")}-${eventId.slice(-4).toUpperCase()}`;

  return { eventId, reference };
}
