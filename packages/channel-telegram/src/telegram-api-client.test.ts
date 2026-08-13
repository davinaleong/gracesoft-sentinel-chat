import { describe, expect, it } from "vitest";
import { TelegramApiClient } from "./telegram-api-client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("TelegramApiClient.sendMessage", () => {
  it("POSTs to /bot<token>/sendMessage for a text send", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchStub = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ ok: true });
    }) as typeof fetch;

    const client = new TelegramApiClient({ botToken: "test-token", fetch: fetchStub });
    await client.sendMessage({ method: "sendMessage", body: { chat_id: "999", text: "hi" } });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.telegram.org/bottest-token/sendMessage");
    expect(JSON.parse(calls[0]!.init?.body as string)).toEqual({ chat_id: "999", text: "hi" });
  });

  it("POSTs to /bot<token>/sendPhoto for a photo send", async () => {
    const calls: string[] = [];
    const fetchStub = (async (url: string | URL) => {
      calls.push(String(url));
      return jsonResponse({ ok: true });
    }) as typeof fetch;

    const client = new TelegramApiClient({ botToken: "test-token", fetch: fetchStub });
    await client.sendMessage({ method: "sendPhoto", body: { chat_id: "999", photo: "https://example.com/pic.jpg" } });

    expect(calls[0]).toBe("https://api.telegram.org/bottest-token/sendPhoto");
  });

  it("throws when the API responds with a non-2xx status", async () => {
    const fetchStub = (async () => new Response("bad request", { status: 400 })) as typeof fetch;
    const client = new TelegramApiClient({ botToken: "t", fetch: fetchStub });
    await expect(client.sendMessage({ method: "sendMessage", body: { chat_id: "1", text: "x" } })).rejects.toThrow(/400/);
  });
});

describe("TelegramApiClient.downloadFileAsDataUri", () => {
  it("resolves the file path via getFile, then downloads and inlines it as a data URI", async () => {
    const fakeBytes = new Uint8Array([9, 8, 7]);
    const fetchStub = (async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("/getFile")) {
        return jsonResponse({ ok: true, result: { file_path: "photos/file_1.jpg" } });
      }
      if (urlStr === "https://api.telegram.org/file/bottest-token/photos/file_1.jpg") {
        return new Response(fakeBytes, { status: 200 });
      }
      throw new Error(`unexpected url: ${urlStr}`);
    }) as typeof fetch;

    const client = new TelegramApiClient({ botToken: "test-token", fetch: fetchStub });
    const resolved = await client.downloadFileAsDataUri("file-id-1", "image/jpeg");

    expect(resolved.mimeType).toBe("image/jpeg");
    expect(resolved.url).toBe(`data:image/jpeg;base64,${Buffer.from(fakeBytes).toString("base64")}`);
  });

  it("throws when getFile returns ok:false", async () => {
    const fetchStub = (async () => jsonResponse({ ok: false })) as typeof fetch;
    const client = new TelegramApiClient({ botToken: "t", fetch: fetchStub });
    await expect(client.downloadFileAsDataUri("file-id-1", "image/jpeg")).rejects.toThrow(/ok:false/);
  });
});

describe("TelegramApiClient.setWebhook", () => {
  it("POSTs the webhook url and secret token", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchStub = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(init?.body as string) });
      return jsonResponse({ ok: true });
    }) as typeof fetch;

    const client = new TelegramApiClient({ botToken: "test-token", fetch: fetchStub });
    await client.setWebhook("https://example.com/webhook", "shh");

    expect(calls[0]!.url).toBe("https://api.telegram.org/bottest-token/setWebhook");
    expect(calls[0]!.body).toEqual({ url: "https://example.com/webhook", secret_token: "shh" });
  });
});
