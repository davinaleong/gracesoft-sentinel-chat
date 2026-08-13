import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import { TelegramChannelAdapter } from "./telegram-adapter.js";
import { TelegramApiClient } from "./telegram-api-client.js";
import { createTelegramWebhookRouter } from "./webhook-router.js";

const SECRET_TOKEN = "shared-secret";

async function waitForAsyncProcessing(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe("createTelegramWebhookRouter", () => {
  let server: Server;
  let baseUrl: string;
  let receivedMessages: NormalizedMessage[];
  let sentPayloads: unknown[];

  beforeAll(async () => {
    receivedMessages = [];
    sentPayloads = [];

    const apiClient = new TelegramApiClient({
      botToken: "t",
      fetch: (async (_url: string | URL, init?: RequestInit) => {
        sentPayloads.push(JSON.parse(init?.body as string));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as typeof fetch,
    });

    const router = createTelegramWebhookRouter({
      secretToken: SECRET_TOKEN,
      adapter: new TelegramChannelAdapter(),
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

  it("rejects a POST with a missing/invalid secret token", async () => {
    const res = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ update_id: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it("accepts a correctly authenticated inbound text update, reaches onMessage, and sends the reply", async () => {
    const update = { update_id: 2, message: { message_id: 1, date: 1746000000, chat: { id: 999 }, text: "hello" } };

    const res = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET_TOKEN },
      body: JSON.stringify(update),
    });
    expect(res.status).toBe(200);

    await waitForAsyncProcessing();

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]!.text).toBe("hello");
    expect(receivedMessages[0]!.senderId).toBe("999");
    expect(sentPayloads).toHaveLength(1);
    expect(sentPayloads[0]).toMatchObject({ text: "echo: hello" });
  });

  it("acks an update with no message/callback_query without calling onMessage", async () => {
    const update = { update_id: 3 };
    const messagesBefore = receivedMessages.length;

    const res = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET_TOKEN },
      body: JSON.stringify(update),
    });
    expect(res.status).toBe(200);

    await waitForAsyncProcessing();
    expect(receivedMessages).toHaveLength(messagesBefore);
  });
});
