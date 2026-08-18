import { describe, expect, it } from "vitest";
import { TwilioApiClient } from "./twilio-api-client.js";

describe("TwilioApiClient.sendMessage", () => {
  it("POSTs form-encoded To/From/Body with Basic Auth to the Messages endpoint", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchStub = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response("{}", { status: 201 });
    }) as typeof fetch;

    const client = new TwilioApiClient({ accountSid: "AC123", authToken: "secret", fromNumber: "+18885550000", fetch: fetchStub });
    await client.sendMessage({ to: "+6591234567", body: "hi" });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("AC123:secret").toString("base64")}`);
    const body = new URLSearchParams(calls[0]!.init?.body as string);
    expect(body.get("To")).toBe("+6591234567");
    expect(body.get("From")).toBe("+18885550000");
    expect(body.get("Body")).toBe("hi");
  });

  it("throws when Twilio responds with a non-2xx status", async () => {
    const fetchStub = (async () => new Response("bad request", { status: 400 })) as typeof fetch;
    const client = new TwilioApiClient({ accountSid: "AC123", authToken: "secret", fromNumber: "+18885550000", fetch: fetchStub });
    await expect(client.sendMessage({ to: "+1", body: "x" })).rejects.toThrow(/400/);
  });
});

describe("TwilioApiClient.downloadMediaAsDataUri", () => {
  it("downloads the media URL with Basic Auth and inlines it as a data URI", async () => {
    const fakeBytes = new Uint8Array([5, 6, 7]);
    let capturedAuth: string | undefined;
    const fetchStub = (async (_url: string | URL, init?: RequestInit) => {
      capturedAuth = (init?.headers as Record<string, string>).Authorization;
      return new Response(fakeBytes, { status: 200 });
    }) as typeof fetch;

    const client = new TwilioApiClient({ accountSid: "AC123", authToken: "secret", fromNumber: "+18885550000", fetch: fetchStub });
    const resolved = await client.downloadMediaAsDataUri("https://api.twilio.com/media/ME123", "image/jpeg");

    expect(capturedAuth).toBe(`Basic ${Buffer.from("AC123:secret").toString("base64")}`);
    expect(resolved.url).toBe(`data:image/jpeg;base64,${Buffer.from(fakeBytes).toString("base64")}`);
  });

  it("throws when the media download fails", async () => {
    const fetchStub = (async () => new Response("", { status: 404 })) as typeof fetch;
    const client = new TwilioApiClient({ accountSid: "AC123", authToken: "secret", fromNumber: "+18885550000", fetch: fetchStub });
    await expect(client.downloadMediaAsDataUri("https://api.twilio.com/media/ME123", "image/jpeg")).rejects.toThrow(/404/);
  });
});
