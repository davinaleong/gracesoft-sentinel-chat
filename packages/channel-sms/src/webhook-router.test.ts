import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import { SmsChannelAdapter } from "./sms-adapter.js";
import { TwilioApiClient } from "./twilio-api-client.js";
import { createSmsWebhookRouter } from "./webhook-router.js";

const AUTH_TOKEN = "test-auth-token";
const WEBHOOK_URL = "https://example.com/webhook";

function signParams(params: Record<string, string>): string {
  let data = WEBHOOK_URL;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }
  return createHmac("sha1", AUTH_TOKEN).update(data, "utf8").digest("base64");
}

async function waitForAsyncProcessing(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe("createSmsWebhookRouter", () => {
  let server: Server;
  let baseUrl: string;
  let receivedMessages: NormalizedMessage[];
  let sentBodies: URLSearchParams[];

  beforeAll(async () => {
    receivedMessages = [];
    sentBodies = [];

    const apiClient = new TwilioApiClient({
      accountSid: "AC123",
      authToken: AUTH_TOKEN,
      fromNumber: "+18885550000",
      fetch: (async (_url: string | URL, init?: RequestInit) => {
        sentBodies.push(new URLSearchParams(init?.body as string));
        return new Response("{}", { status: 201 });
      }) as typeof fetch,
    });

    const router = createSmsWebhookRouter({
      authToken: AUTH_TOKEN,
      webhookUrl: WEBHOOK_URL,
      adapter: new SmsChannelAdapter(),
      apiClient,
      onMessage: async (message) => {
        receivedMessages.push(message);
        return { text: `echo: ${message.text}` } satisfies NormalizedResponse;
      },
      onError: (err) => {
        throw err;
      },
    });

    const app = express();
    app.use(router);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("rejects a POST with an invalid signature", async () => {
    const form = new URLSearchParams({ MessageSid: "SM1", From: "+6591234567", To: "+18885550000", Body: "hi" });
    const res = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "invalid" },
      body: form.toString(),
    });
    expect(res.status).toBe(403);
  });

  it("accepts a correctly signed inbound SMS, reaches onMessage, and sends the reply", async () => {
    const params = { MessageSid: "SM2", From: "+6591234567", To: "+18885550000", Body: "hello" };
    const form = new URLSearchParams(params);

    const res = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signParams(params) },
      body: form.toString(),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/xml");

    await waitForAsyncProcessing();

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]!.text).toBe("hello");
    expect(receivedMessages[0]!.senderId).toBe("+6591234567");
    expect(sentBodies).toHaveLength(1);
    expect(sentBodies[0]!.get("Body")).toBe("echo: hello");
    expect(sentBodies[0]!.get("To")).toBe("+6591234567");
  });
});
