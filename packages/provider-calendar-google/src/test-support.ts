import type { GoogleCalendarClient } from "./google-calendar-client.js";

type FreebusyParams = Parameters<GoogleCalendarClient["freebusy"]["query"]>[0];
type InsertParams = Parameters<GoogleCalendarClient["events"]["insert"]>[0];

/** In-memory stand-in for the Google Calendar API — no HTTP involved. */
export class FakeGoogleCalendarClient implements GoogleCalendarClient {
  public freebusyCalls: FreebusyParams[] = [];
  public insertCalls: InsertParams[] = [];
  private nextId = 1;

  constructor(private readonly busyByCalendar: Record<string, { start: string; end: string }[]> = {}) {}

  freebusy = {
    query: async (params: FreebusyParams) => {
      this.freebusyCalls.push(params);
      const calendars: Record<string, { busy: { start: string; end: string }[] }> = {};
      for (const item of params.requestBody.items) {
        calendars[item.id] = { busy: this.busyByCalendar[item.id] ?? [] };
      }
      return { data: { calendars } };
    },
  };

  events = {
    insert: async (params: InsertParams) => {
      this.insertCalls.push(params);
      return {
        data: {
          id: `event-${this.nextId++}`,
          start: params.requestBody.start,
          end: params.requestBody.end,
        },
      };
    },
  };
}
