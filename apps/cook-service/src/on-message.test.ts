import { describe, expect, it } from "vitest";
import type { NormalizedMessage } from "@gracesoft-sentinel/core";
import { createOnMessageHandler } from "./on-message.js";
import { FakeAiProvider, FakeConversationLogger, FakeSessionStore } from "./test-support.js";

function makeMessage(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    id: "msg-1",
    channel: "whatsapp",
    senderId: "6591234567",
    timestamp: new Date().toISOString(),
    raw: {},
    ...overrides,
  };
}

describe("createOnMessageHandler", () => {
  it("prompts for a photo on the first text message", async () => {
    const onMessage = createOnMessageHandler({ aiProvider: new FakeAiProvider(), sessionStore: new FakeSessionStore(), logger: new FakeConversationLogger() });
    const response = await onMessage(makeMessage({ text: "hi" }));
    expect(response.text).toMatch(/send me a photo/i);
  });

  it("returns a full recipe for a photo message", async () => {
    const onMessage = createOnMessageHandler({ aiProvider: new FakeAiProvider(), sessionStore: new FakeSessionStore(), logger: new FakeConversationLogger() });
    const response = await onMessage(makeMessage({ media: [{ type: "image", url: "https://example.com/dish.jpg" }] }));
    expect(response.text).toContain("Chicken Rice");
  });

  it("logs inbound (with a [photo] placeholder) and outbound messages", async () => {
    const logger = new FakeConversationLogger();
    const onMessage = createOnMessageHandler({ aiProvider: new FakeAiProvider(), sessionStore: new FakeSessionStore(), logger });
    await onMessage(makeMessage({ media: [{ type: "image", url: "https://example.com/dish.jpg" }] }));

    expect(logger.messages).toHaveLength(2);
    expect(logger.messages[0]).toMatchObject({ direction: "inbound", text: "[photo]" });
    expect(logger.messages[1]).toMatchObject({ direction: "outbound" });
  });

  it("persists session state with the 1h Cook TTL", async () => {
    const sessionStore = new FakeSessionStore();
    const onMessage = createOnMessageHandler({ aiProvider: new FakeAiProvider(), sessionStore, logger: new FakeConversationLogger() });
    await onMessage(makeMessage({ text: "hi" }));
    expect(sessionStore.setCalls[0]!.ttlSeconds).toBe(60 * 60);
  });

  it("derives distinct sessions per channel+sender, namespaced separately from concierge sessions", async () => {
    const sessionStore = new FakeSessionStore();
    const onMessage = createOnMessageHandler({ aiProvider: new FakeAiProvider(), sessionStore, logger: new FakeConversationLogger() });
    await onMessage(makeMessage({ text: "hi" }));
    expect(sessionStore.setCalls[0]!.state.sessionId).toBe("cook:whatsapp:6591234567");
  });
});
