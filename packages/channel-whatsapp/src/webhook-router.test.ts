import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import { WhatsAppChannelAdapter } from "./whatsapp-adapter.js";
import { WhatsAppApiClient } from "./whatsapp-api-client.js";
import { createWhatsAppWebhookRouter } from "./webhook-router.js";

const VERIFY_TOKEN = "verify-token";
const APP_SECRET = "app-secret";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;
}

async function waitForAsyncProcessing(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe("createWhatsAppWebhookRouter", () => {
  let server: Server;
  let baseUrl: string;
  let receivedMessages: NormalizedMessage[];
  let sentPayloads: unknown[];

  beforeAll(async () => {
    receivedMessages = [];
    sentPayloads = [];

    const apiClient = new WhatsAppApiClient({
      accessToken: "t",
      phoneNumberId: "1",
      fetch: (async (_url: string | URL, init?: RequestInit) => {
        sentPayloads.push(JSON.parse(init?.body as string));
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    });

    const router = createWhatsAppWebhookRouter({
      verifyToken: VERIFY_TOKEN,
      appSecret: APP_SECRET,
      adapter: new WhatsAppChannelAdapter(),
      apiClient,
      onMessage: async (message) => {
        receivedMessages.push(message);
        return { text: `echo: ${message.text}` } satisfies NormalizedResponse;
      },
      onError: (err) => {
        throw err; // fail loudly in tests instead of swallowing
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

  it("handles the GET verification handshake", async () => {
    const res = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=abc123`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("abc123");
  });

  it("rejects the GET handshake with the wrong verify token", async () => {
    const res = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123`);
    expect(res.status).toBe(403);
  });

  it("rejects a POST with an invalid signature", async () => {
    const body = JSON.stringify({ entry: [] });
    const res = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=wrong" },
      body,
    });
    expect(res.status).toBe(403);
  });

  it("accepts a correctly signed inbound text message, reaches onMessage, and sends the reply", async () => {
    const payload = {
      entry: [
        {
          id: "e1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                messages: [
                  { id: "wamid.1", from: "6591234567", timestamp: "1746000000", type: "text", text: { body: "hello" } },
                ],
              },
            },
          ],
        },
      ],
    };
    const body = JSON.stringify(payload);
    const res = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(body) },
      body,
    });
    expect(res.status).toBe(200);

    await waitForAsyncProcessing();

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]!.text).toBe("hello");
    expect(receivedMessages[0]!.senderId).toBe("6591234567");
    expect(sentPayloads).toHaveLength(1);
    expect(sentPayloads[0]).toMatchObject({ text: { body: "echo: hello" } });
  });

  it("acks a status-update payload (no messages) without calling onMessage", async () => {
    const payload = { entry: [{ id: "e1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", statuses: [{}] } }] }] };
    const body = JSON.stringify(payload);
    const messagesBefore = receivedMessages.length;

    const res = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(body) },
      body,
    });
    expect(res.status).toBe(200);

    await waitForAsyncProcessing();
    expect(receivedMessages).toHaveLength(messagesBefore);
  });
});
