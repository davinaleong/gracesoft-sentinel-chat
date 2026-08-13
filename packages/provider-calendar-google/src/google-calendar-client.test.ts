import { describe, expect, it } from "vitest";
import { createGoogleCalendarClient } from "./google-calendar-client.js";

describe("createGoogleCalendarClient", () => {
  it("builds a client exposing the expected methods without making a network call", () => {
    // Constructing the JWT auth client and the calendar client is purely
    // local — no request is made until a method is actually invoked.
    const client = createGoogleCalendarClient({
      serviceAccountEmail: "svc@example.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
    });
    expect(typeof client.freebusy.query).toBe("function");
    expect(typeof client.events.insert).toBe("function");
  });
});
