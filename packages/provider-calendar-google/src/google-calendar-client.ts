import { google } from "googleapis";

/**
 * The minimal slice of the `googleapis` Calendar v3 client this provider
 * actually calls — kept as our own small interface (rather than depending
 * on the full `calendar_v3.Calendar` surface everywhere) so tests can
 * substitute an in-memory fake without any HTTP mocking.
 */
export interface GoogleCalendarClient {
  freebusy: {
    query(params: {
      requestBody: {
        timeMin: string;
        timeMax: string;
        timeZone: string;
        items: { id: string }[];
      };
    }): Promise<{ data: { calendars?: Record<string, { busy?: { start?: string | null; end?: string | null }[] }> } }>;
  };
  events: {
    insert(params: {
      calendarId: string;
      requestBody: {
        summary: string;
        description?: string;
        start: { dateTime: string; timeZone: string };
        end: { dateTime: string; timeZone: string };
        attendees?: { email: string }[];
        extendedProperties?: { private?: Record<string, string> };
      };
    }): Promise<{ data: GoogleCalendarEvent }>;
    /** `privateExtendedProperty` filters as `"key=value"` strings, ANDed together. */
    list(params: {
      calendarId: string;
      privateExtendedProperty?: string[];
      maxResults?: number;
    }): Promise<{ data: { items?: GoogleCalendarEvent[] } }>;
    patch(params: {
      calendarId: string;
      eventId: string;
      requestBody: {
        start?: { dateTime: string; timeZone: string };
        end?: { dateTime: string; timeZone: string };
      };
    }): Promise<{ data: GoogleCalendarEvent }>;
    delete(params: { calendarId: string; eventId: string }): Promise<unknown>;
  };
}

export interface GoogleCalendarEvent {
  id?: string | null;
  start?: { dateTime?: string | null } | null;
  end?: { dateTime?: string | null } | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
}

export interface GoogleCalendarAuthConfig {
  serviceAccountEmail: string;
  privateKey: string;
}

/**
 * Builds the real `googleapis` client, authenticated via a service-account
 * JWT (calendar scope only) — the same auth model the legacy WhatsApp-only
 * concierge used, now isolated behind `GoogleCalendarClient` instead of
 * being called directly from agent code.
 */
export function createGoogleCalendarClient(config: GoogleCalendarAuthConfig): GoogleCalendarClient {
  const auth = new google.auth.JWT(
    config.serviceAccountEmail,
    undefined,
    config.privateKey.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/calendar"]
  );
  // The real SDK client's methods are overloaded (promise vs. callback style,
  // optional `options` arg) in ways that don't structurally match our
  // minimal interface — the cast is safe because we only ever call the
  // single-argument promise form.
  return google.calendar({ version: "v3", auth }) as unknown as GoogleCalendarClient;
}
