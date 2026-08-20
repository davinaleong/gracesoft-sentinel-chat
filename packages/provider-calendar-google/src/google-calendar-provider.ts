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
} from "@gracesoft-sentinel/core";
import { invertBusyToFree } from "./free-busy.js";
import { createGoogleCalendarClient, type GoogleCalendarAuthConfig, type GoogleCalendarClient, type GoogleCalendarEvent } from "./google-calendar-client.js";

/** `extendedProperties.private.appointmentId` is the authoritative index — never parsed from `summary` text. */
function toBooking(event: GoogleCalendarEvent, fallback: { start: string; end: string }): Booking {
  if (!event.id) {
    throw new Error("Google Calendar event is missing an id");
  }
  const appointmentId = event.extendedProperties?.private?.appointmentId;
  if (!appointmentId) {
    throw new Error(`Google Calendar event ${event.id} has no appointmentId in extendedProperties.private`);
  }
  return {
    id: event.id,
    appointmentId,
    start: event.start?.dateTime ?? fallback.start,
    end: event.end?.dateTime ?? fallback.end,
    raw: event,
  };
}

export interface GoogleCalendarProviderConfig {
  client: GoogleCalendarClient;
  /**
   * Google Calendar has no native "business hours" concept for a regular
   * resource calendar — this is the `BusinessHours` (weekly map + dated
   * exceptions, per Milestone 1/2) that `getBusinessHours` serves back.
   * Owned by whoever assembles this provider (real per-business hours and
   * holiday data get wired in at Milestone 8's service composition), not
   * hardcoded here — the legacy version's hardcoded fixed-hour array is
   * exactly what Milestone 2's business-hours model replaced.
   */
  businessHours: BusinessHours;
}

/**
 * Formalizes the legacy WhatsApp-only concierge's Google Calendar
 * integration behind `CalendarProvider` — `agent-concierge` depends on the
 * interface only, never on `googleapis` or this class directly.
 */
export class GoogleCalendarProvider implements CalendarProvider {
  constructor(private readonly config: GoogleCalendarProviderConfig) {}

  async getAvailability(input: GetAvailabilityInput): Promise<AvailabilitySlot[]> {
    const response = await this.config.client.freebusy.query({
      requestBody: {
        timeMin: input.from,
        timeMax: input.to,
        timeZone: input.timezone,
        items: [{ id: input.calendarId }],
      },
    });
    const busy = response.data.calendars?.[input.calendarId]?.busy ?? [];
    return invertBusyToFree(input.from, input.to, busy);
  }

  async createBooking(input: CreateBookingInput): Promise<Booking> {
    const attendeeEmail = input.attendee?.contact?.includes("@") ? input.attendee.contact : undefined;
    const response = await this.config.client.events.insert({
      calendarId: input.calendarId,
      requestBody: {
        summary: input.summary,
        description: input.attendee?.name ? `Booked for ${input.attendee.name}` : undefined,
        start: { dateTime: input.start, timeZone: input.timezone },
        end: { dateTime: input.end, timeZone: input.timezone },
        attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined,
        extendedProperties: { private: { appointmentId: input.appointmentId } },
      },
    });

    return toBooking(response.data, { start: input.start, end: input.end });
  }

  async findBookingByAppointmentId(input: FindBookingByAppointmentIdInput): Promise<Booking | null> {
    const response = await this.config.client.events.list({
      calendarId: input.calendarId,
      privateExtendedProperty: [`appointmentId=${input.appointmentId}`],
      maxResults: 1,
    });
    const event = response.data.items?.[0];
    if (!event) return null;
    return toBooking(event, {
      start: event.start?.dateTime ?? "",
      end: event.end?.dateTime ?? "",
    });
  }

  async updateBooking(input: UpdateBookingInput): Promise<Booking> {
    const response = await this.config.client.events.patch({
      calendarId: input.calendarId,
      eventId: input.id,
      requestBody: {
        start: { dateTime: input.start, timeZone: input.timezone },
        end: { dateTime: input.end, timeZone: input.timezone },
      },
    });
    return toBooking(response.data, { start: input.start, end: input.end });
  }

  async getBusinessHours(_input: GetBusinessHoursInput): Promise<BusinessHours> {
    return this.config.businessHours;
  }
}

/**
 * Config-driven construction from the process environment, mirroring
 * `createOpenAIProviderFromEnv` — `businessHours` is passed separately
 * since it's structured business data, not something env vars carry.
 */
export function createGoogleCalendarProviderFromEnv(
  env: NodeJS.ProcessEnv,
  businessHours: BusinessHours
): GoogleCalendarProvider {
  const serviceAccountEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!serviceAccountEmail) throw new Error("Missing required env var: GOOGLE_SERVICE_ACCOUNT_EMAIL");
  if (!privateKey) throw new Error("Missing required env var: GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");

  const authConfig: GoogleCalendarAuthConfig = { serviceAccountEmail, privateKey };
  return new GoogleCalendarProvider({ client: createGoogleCalendarClient(authConfig), businessHours });
}
