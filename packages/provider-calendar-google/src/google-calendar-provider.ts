import type {
  AvailabilitySlot,
  Booking,
  BusinessHours,
  CalendarProvider,
  CreateBookingInput,
  GetAvailabilityInput,
  GetBusinessHoursInput,
} from "@gracesoft-sentinel/core";
import { invertBusyToFree } from "./free-busy.js";
import { createGoogleCalendarClient, type GoogleCalendarAuthConfig, type GoogleCalendarClient } from "./google-calendar-client.js";

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
      },
    });

    if (!response.data.id) {
      throw new Error("Google Calendar did not return an event id for the created booking");
    }

    return {
      id: response.data.id,
      start: response.data.start?.dateTime ?? input.start,
      end: response.data.end?.dateTime ?? input.end,
      raw: response.data,
    };
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
