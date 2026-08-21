import type { GoogleCalendarClient, GoogleCalendarEvent } from "./google-calendar-client.js";

type FreebusyParams = Parameters<GoogleCalendarClient["freebusy"]["query"]>[0];
type InsertParams = Parameters<GoogleCalendarClient["events"]["insert"]>[0];
type ListParams = Parameters<GoogleCalendarClient["events"]["list"]>[0];
type PatchParams = Parameters<GoogleCalendarClient["events"]["patch"]>[0];
type DeleteParams = Parameters<GoogleCalendarClient["events"]["delete"]>[0];

/** In-memory stand-in for the Google Calendar API — no HTTP involved. */
export class FakeGoogleCalendarClient implements GoogleCalendarClient {
  public freebusyCalls: FreebusyParams[] = [];
  public insertCalls: InsertParams[] = [];
  public listCalls: ListParams[] = [];
  public patchCalls: PatchParams[] = [];
  public deleteCalls: DeleteParams[] = [];
  private nextId = 1;
  private readonly eventsById = new Map<string, GoogleCalendarEvent>();

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
      const event: GoogleCalendarEvent = {
        id: `event-${this.nextId++}`,
        start: params.requestBody.start,
        end: params.requestBody.end,
        extendedProperties: params.requestBody.extendedProperties,
      };
      this.eventsById.set(event.id!, event);
      return { data: event };
    },
    list: async (params: ListParams) => {
      this.listCalls.push(params);
      const filters = (params.privateExtendedProperty ?? []).map((pair) => {
        const [key, ...rest] = pair.split("=");
        return [key!, rest.join("=")] as const;
      });
      const items = [...this.eventsById.values()].filter((event) =>
        filters.every(([key, value]) => event.extendedProperties?.private?.[key] === value)
      );
      return { data: { items: params.maxResults ? items.slice(0, params.maxResults) : items } };
    },
    patch: async (params: PatchParams) => {
      this.patchCalls.push(params);
      const existing = this.eventsById.get(params.eventId);
      if (!existing) throw new Error(`No fake event with id ${params.eventId}`);
      const updated: GoogleCalendarEvent = {
        ...existing,
        start: params.requestBody.start ?? existing.start,
        end: params.requestBody.end ?? existing.end,
      };
      this.eventsById.set(params.eventId, updated);
      return { data: updated };
    },
    delete: async (params: DeleteParams) => {
      this.deleteCalls.push(params);
      if (!this.eventsById.has(params.eventId)) {
        // Mirrors the real API: deleting an already-gone event is a 410, not a silent no-op.
        const err = new Error(`No fake event with id ${params.eventId}`) as Error & { code: number };
        err.code = 410;
        throw err;
      }
      this.eventsById.delete(params.eventId);
      return {};
    },
  };
}
