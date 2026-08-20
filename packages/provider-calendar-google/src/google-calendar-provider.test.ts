import { describe, expect, it } from "vitest";
import type { BusinessHours } from "@gracesoft-sentinel/core";
import { runCalendarProviderContractTests } from "@gracesoft-sentinel/core/testing";
import { createGoogleCalendarProviderFromEnv, GoogleCalendarProvider } from "./google-calendar-provider.js";
import { FakeGoogleCalendarClient } from "./test-support.js";

const BUSINESS_HOURS: BusinessHours = {
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

runCalendarProviderContractTests(
  "GoogleCalendarProvider (fake client)",
  () => new GoogleCalendarProvider({ client: new FakeGoogleCalendarClient(), businessHours: BUSINESS_HOURS })
);

describe("GoogleCalendarProvider — request shaping", () => {
  it("getAvailability queries freebusy with the requested range/timezone/calendar and inverts busy to free", async () => {
    const client = new FakeGoogleCalendarClient({
      "test-calendar": [{ start: "2026-05-04T12:00:00.000Z", end: "2026-05-04T13:00:00.000Z" }],
    });
    const provider = new GoogleCalendarProvider({ client, businessHours: BUSINESS_HOURS });

    const slots = await provider.getAvailability({
      calendarId: "test-calendar",
      from: "2026-05-04T09:00:00.000Z",
      to: "2026-05-04T18:00:00.000Z",
      timezone: "Asia/Singapore",
    });

    expect(client.freebusyCalls).toHaveLength(1);
    expect(client.freebusyCalls[0]!.requestBody).toEqual({
      timeMin: "2026-05-04T09:00:00.000Z",
      timeMax: "2026-05-04T18:00:00.000Z",
      timeZone: "Asia/Singapore",
      items: [{ id: "test-calendar" }],
    });
    expect(slots).toEqual([
      { start: "2026-05-04T09:00:00.000Z", end: "2026-05-04T12:00:00.000Z" },
      { start: "2026-05-04T13:00:00.000Z", end: "2026-05-04T18:00:00.000Z" },
    ]);
  });

  it("createBooking maps CreateBookingInput onto the Google event shape, storing appointmentId in extendedProperties", async () => {
    const client = new FakeGoogleCalendarClient();
    const provider = new GoogleCalendarProvider({ client, businessHours: BUSINESS_HOURS });

    const booking = await provider.createBooking({
      calendarId: "test-calendar",
      start: "2026-05-04T10:00:00+08:00",
      end: "2026-05-04T10:30:00+08:00",
      timezone: "Asia/Singapore",
      summary: "GS-ABCD-1234 whatsapp",
      appointmentId: "GS-ABCD-1234",
      attendee: { name: "Alex Tan", contact: "alex@example.com" },
    });

    expect(client.insertCalls).toHaveLength(1);
    expect(client.insertCalls[0]!.requestBody).toEqual({
      summary: "GS-ABCD-1234 whatsapp",
      description: "Booked for Alex Tan",
      start: { dateTime: "2026-05-04T10:00:00+08:00", timeZone: "Asia/Singapore" },
      end: { dateTime: "2026-05-04T10:30:00+08:00", timeZone: "Asia/Singapore" },
      attendees: [{ email: "alex@example.com" }],
      extendedProperties: { private: { appointmentId: "GS-ABCD-1234" } },
    });
    expect(booking.id).toBe("event-1");
    expect(booking.appointmentId).toBe("GS-ABCD-1234");
  });

  it("createBooking omits attendees when the contact isn't email-shaped", async () => {
    const client = new FakeGoogleCalendarClient();
    const provider = new GoogleCalendarProvider({ client, businessHours: BUSINESS_HOURS });

    await provider.createBooking({
      calendarId: "test-calendar",
      start: "2026-05-04T10:00:00+08:00",
      end: "2026-05-04T10:30:00+08:00",
      timezone: "Asia/Singapore",
      summary: "GS-ABCD-1234 whatsapp",
      appointmentId: "GS-ABCD-1234",
      attendee: { contact: "+6591234567" },
    });

    expect(client.insertCalls[0]!.requestBody.attendees).toBeUndefined();
  });

  it("findBookingByAppointmentId filters events.list by the private extended property", async () => {
    const client = new FakeGoogleCalendarClient();
    const provider = new GoogleCalendarProvider({ client, businessHours: BUSINESS_HOURS });
    await provider.createBooking({
      calendarId: "test-calendar",
      start: "2026-05-04T10:00:00+08:00",
      end: "2026-05-04T10:30:00+08:00",
      timezone: "Asia/Singapore",
      summary: "GS-ABCD-1234 whatsapp",
      appointmentId: "GS-ABCD-1234",
    });

    const found = await provider.findBookingByAppointmentId({ calendarId: "test-calendar", appointmentId: "GS-ABCD-1234" });

    expect(client.listCalls[0]).toMatchObject({
      calendarId: "test-calendar",
      privateExtendedProperty: ["appointmentId=GS-ABCD-1234"],
    });
    expect(found?.appointmentId).toBe("GS-ABCD-1234");
  });

  it("updateBooking patches only start/end, preserving the event's appointmentId", async () => {
    const client = new FakeGoogleCalendarClient();
    const provider = new GoogleCalendarProvider({ client, businessHours: BUSINESS_HOURS });
    const created = await provider.createBooking({
      calendarId: "test-calendar",
      start: "2026-05-04T10:00:00+08:00",
      end: "2026-05-04T10:30:00+08:00",
      timezone: "Asia/Singapore",
      summary: "GS-ABCD-1234 whatsapp",
      appointmentId: "GS-ABCD-1234",
    });

    const updated = await provider.updateBooking({
      calendarId: "test-calendar",
      id: created.id,
      start: "2026-05-05T14:00:00+08:00",
      end: "2026-05-05T14:30:00+08:00",
      timezone: "Asia/Singapore",
    });

    expect(client.patchCalls[0]!.requestBody).toEqual({
      start: { dateTime: "2026-05-05T14:00:00+08:00", timeZone: "Asia/Singapore" },
      end: { dateTime: "2026-05-05T14:30:00+08:00", timeZone: "Asia/Singapore" },
    });
    expect(updated.id).toBe(created.id);
    expect(updated.appointmentId).toBe("GS-ABCD-1234");
  });

  it("getBusinessHours returns the configured BusinessHours, including dated exceptions", async () => {
    const provider = new GoogleCalendarProvider({ client: new FakeGoogleCalendarClient(), businessHours: BUSINESS_HOURS });
    const hours = await provider.getBusinessHours({ calendarId: "test-calendar" });
    expect(hours).toBe(BUSINESS_HOURS);
    expect(hours.exceptions).toEqual([{ date: "2026-05-02", hours: null, reason: "Public holiday" }]);
  });
});

describe("createGoogleCalendarProviderFromEnv", () => {
  it("constructs a provider from GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY", () => {
    const provider = createGoogleCalendarProviderFromEnv(
      {
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "svc@example.iam.gserviceaccount.com",
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
      } as NodeJS.ProcessEnv,
      BUSINESS_HOURS
    );
    expect(provider).toBeInstanceOf(GoogleCalendarProvider);
  });

  it("throws a clear error when the service account email is missing", () => {
    expect(() =>
      createGoogleCalendarProviderFromEnv(
        { GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "key" } as NodeJS.ProcessEnv,
        BUSINESS_HOURS
      )
    ).toThrow(/GOOGLE_SERVICE_ACCOUNT_EMAIL/);
  });

  it("throws a clear error when the private key is missing", () => {
    expect(() =>
      createGoogleCalendarProviderFromEnv(
        { GOOGLE_SERVICE_ACCOUNT_EMAIL: "svc@example.iam.gserviceaccount.com" } as NodeJS.ProcessEnv,
        BUSINESS_HOURS
      )
    ).toThrow(/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/);
  });
});
