import { describe, expect, it } from "vitest";
import type { NormalizedMessage } from "@gracesoft-sentinel/core";
import { RedisRateLimiter, type RedisLikeClient } from "@gracesoft-sentinel/provider-session-redis";
import { createOnMessageHandler } from "./on-message.js";
import { FakeAiProvider, FakeConversationLogger, FakeRecipeSourceProvider, FakeSessionStore, createSilentTestLogger } from "./test-support.js";

/** Minimal local double — provider-session-redis's own fake is package-internal, not part of its public exports. */
class InMemoryRedisLikeClient implements RedisLikeClient {
  private readonly store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.store.set(key, value);
    return "OK";
  }
  async setex(key: string, _seconds: number, value: string) {
    this.store.set(key, value);
    return "OK";
  }
  async del(key: string) {
    return this.store.delete(key) ? 1 : 0;
  }
  async incr(key: string) {
    const next = (Number(this.store.get(key)) || 0) + 1;
    this.store.set(key, String(next));
    return next;
  }
  async expire(_key: string, _seconds: number) {
    return 1;
  }
}

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
    const onMessage = createOnMessageHandler({
      aiProvider: new FakeAiProvider(),
      sessionStore: new FakeSessionStore(),
      conversationLogger: new FakeConversationLogger(),
      appLogger: createSilentTestLogger(),
    });
    const response = await onMessage(makeMessage({ text: "hi" }));
    expect(response.text).toMatch(/send me a photo/i);
  });

  it("returns a full recipe for a photo message", async () => {
    const onMessage = createOnMessageHandler({
      aiProvider: new FakeAiProvider(),
      sessionStore: new FakeSessionStore(),
      conversationLogger: new FakeConversationLogger(),
      appLogger: createSilentTestLogger(),
    });
    const response = await onMessage(makeMessage({ media: [{ type: "image", url: "https://example.com/dish.jpg" }] }));
    expect(response.text).toContain("Chicken Rice");
  });

  it("logs inbound (with a [photo] placeholder) and outbound messages", async () => {
    const logger = new FakeConversationLogger();
    const onMessage = createOnMessageHandler({
      aiProvider: new FakeAiProvider(),
      sessionStore: new FakeSessionStore(),
      conversationLogger: logger,
      appLogger: createSilentTestLogger(),
    });
    await onMessage(makeMessage({ media: [{ type: "image", url: "https://example.com/dish.jpg" }] }));

    expect(logger.messages).toHaveLength(2);
    expect(logger.messages[0]).toMatchObject({ direction: "inbound", text: "[photo]" });
    expect(logger.messages[1]).toMatchObject({ direction: "outbound" });
  });

  it("redacts PII (e.g. an email) out of message text before logging it", async () => {
    const logger = new FakeConversationLogger();
    const onMessage = createOnMessageHandler({
      aiProvider: new FakeAiProvider(),
      sessionStore: new FakeSessionStore(),
      conversationLogger: logger,
      appLogger: createSilentTestLogger(),
    });
    await onMessage(makeMessage({ text: "send the recipe to alex@example.com" }));
    expect(logger.messages[0]!.text).toBe("send the recipe to [redacted-email]");
  });

  it("persists session state with the 1h Cook TTL", async () => {
    const sessionStore = new FakeSessionStore();
    const onMessage = createOnMessageHandler({
      aiProvider: new FakeAiProvider(),
      sessionStore,
      conversationLogger: new FakeConversationLogger(),
      appLogger: createSilentTestLogger(),
    });
    await onMessage(makeMessage({ text: "hi" }));
    expect(sessionStore.setCalls[0]!.ttlSeconds).toBe(60 * 60);
  });

  it("derives distinct sessions per channel+sender, namespaced separately from concierge sessions", async () => {
    const sessionStore = new FakeSessionStore();
    const onMessage = createOnMessageHandler({
      aiProvider: new FakeAiProvider(),
      sessionStore,
      conversationLogger: new FakeConversationLogger(),
      appLogger: createSilentTestLogger(),
    });
    await onMessage(makeMessage({ text: "hi" }));
    expect(sessionStore.setCalls[0]!.state.sessionId).toBe("cook:whatsapp:6591234567");
  });

  it("threads an optional recipeSourceProvider through to agent-cook's personal-recipe lookup", async () => {
    const recipeSourceProvider = new FakeRecipeSourceProvider([
      { id: "1", title: "Mom's Chicken Curry", raw: { content: "Simmer for 40 minutes." } },
    ]);
    const onMessage = createOnMessageHandler({
      aiProvider: new FakeAiProvider(),
      sessionStore: new FakeSessionStore(),
      conversationLogger: new FakeConversationLogger(),
      appLogger: createSilentTestLogger(),
      recipeSourceProvider,
    });

    const response = await onMessage(makeMessage({ text: "do you have my mom's recipe for chicken curry?" }));

    expect(response.text).toContain("Mom's Chicken Curry");
    expect(recipeSourceProvider.findRecipesCalls).toHaveLength(1);
  });

  it("replies with a rate-limit message and does no further work once the sender exceeds the budget", async () => {
    const sessionStore = new FakeSessionStore();
    const rateLimiter = new RedisRateLimiter({ client: new InMemoryRedisLikeClient(), limit: 1, windowSeconds: 60 });
    const onMessage = createOnMessageHandler({
      aiProvider: new FakeAiProvider(),
      sessionStore,
      conversationLogger: new FakeConversationLogger(),
      appLogger: createSilentTestLogger(),
      rateLimiter,
    });

    await onMessage(makeMessage({ text: "hi" }));
    const second = await onMessage(makeMessage({ text: "hi again" }));

    expect(second.text).toMatch(/sending messages/i);
    expect(sessionStore.setCalls).toHaveLength(1);
  });
});
