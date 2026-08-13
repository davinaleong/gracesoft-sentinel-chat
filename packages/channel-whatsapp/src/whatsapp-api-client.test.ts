import { describe, expect, it } from "vitest";
import { WhatsAppApiClient } from "./whatsapp-api-client.js";

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 500 });
}

describe("WhatsAppApiClient.sendMessage", () => {
  it("POSTs to /{phoneNumberId}/messages with a bearer token", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchStub = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const client = new WhatsAppApiClient({ accessToken: "test-token", phoneNumberId: "1234567890", fetch: fetchStub });
    await client.sendMessage({ messaging_product: "whatsapp", to: "659999", type: "text", text: { body: "hi" } });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v20.0/1234567890/messages");
    expect(calls[0]!.init?.method).toBe("POST");
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect(JSON.parse(calls[0]!.init?.body as string)).toMatchObject({ to: "659999" });
  });

  it("throws when the API responds with a non-2xx status", async () => {
    const fetchStub = (async () => new Response("bad request", { status: 400 })) as typeof fetch;
    const client = new WhatsAppApiClient({ accessToken: "t", phoneNumberId: "1", fetch: fetchStub });
    await expect(client.sendMessage({ messaging_product: "whatsapp", to: "1", type: "text", text: { body: "x" } })).rejects.toThrow(/400/);
  });
});

describe("WhatsAppApiClient.downloadMediaAsDataUri", () => {
  it("resolves the media URL then downloads and inlines it as a data URI", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3, 4]);
    const fetchStub = (async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.endsWith("/media-123")) {
        return jsonResponse({ url: "https://lookaside.fbsbx.com/signed-url", mime_type: "image/jpeg" });
      }
      if (urlStr === "https://lookaside.fbsbx.com/signed-url") {
        return new Response(fakeBytes, { status: 200 });
      }
      throw new Error(`unexpected url: ${urlStr}`);
    }) as typeof fetch;

    const client = new WhatsAppApiClient({ accessToken: "t", phoneNumberId: "1", fetch: fetchStub });
    const resolved = await client.downloadMediaAsDataUri("media-123");

    expect(resolved.mimeType).toBe("image/jpeg");
    expect(resolved.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(resolved.url).toContain(Buffer.from(fakeBytes).toString("base64"));
  });
});
