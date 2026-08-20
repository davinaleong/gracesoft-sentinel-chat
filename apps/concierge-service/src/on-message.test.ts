import { describe, expect, it } from "vitest";
import type { BusinessConfig, CalendarProvider, NormalizedMessage } from "@gracesoft-sentinel/core";
import type { FaqGroundingBlueprint } from "@gracesoft-sentinel/agent-concierge";
import { RedisRateLimiter, type RedisLikeClient } from "@gracesoft-sentinel/provider-session-redis";
import { createOnMessageHandler, type TenantContext } from "./on-message.js";
import { FakeAiProvider, FakeCalendarProvider, FakeConversationLogger, FakeSessionStore, createSilentTestLogger } from "./test-support.js";

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

const BUSINESS_CONFIG: BusinessConfig = {
  businessId: "test-biz",
  timezone: "Asia/Singapore",
  faqBlueprintPath: "./faq.json",
  calendarId: "test-calendar",
  businessHours: {
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
    exceptions: [],
  },
};

const FAQ_BLUEPRINT: FaqGroundingBlueprint = {
  system_prompt: "unused",
  ai_disclosure: { required: false, opening_message: "unused" },
  knowledge_base: {},
  guardrails: [],
  escalation_policy: { conditions: [], handoff_instruction: "", example_handoff_response: "" },
};

function singleTenant(calendarProvider: CalendarProvider = new FakeCalendarProvider()): () => TenantContext {
  const tenant: TenantContext = { businessConfig: BUSINESS_CONFIG, faqBlueprint: FAQ_BLUEPRINT, calendarProvider };
  return () => tenant;
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
  it("creates a fresh session on first contact and persists it back to the store", async () => {
    const sessionStore = new FakeSessionStore();
    const onMessage = createOnMessageHandler({
      resolveTenant: singleTenant(),
      aiProvider: new FakeAiProvider(),
      sessionStore,
      conversationLogger: new FakeConversationLogger(),
      appLogger: createSilentTestLogger(),
    });

    const response = await onMessage(makeMessage({ text: "book something" }));

    expect(response.quickReplies).toBeDefined();
    expect(sessionStore.setCalls).toHaveLength(1);
    expect(sessionStore.setCalls[0]!.ttlSeconds).toBe(60 * 60 * 24);
  });

  it("reuses an existing session on a later message from the same sender", async () => {
    const sessionStore = new FakeSessionStore();
    const calendarProvider = new FakeCalendarProvider();
    const onMessage = createOnMessageHandler({
      resolveTenant: singleTenant(calendarProvider),
      aiProvider: new FakeAiProvider(),
      sessionStore,
      conversationLogger: new FakeConversationLogger(),
      appLogger: createSilentTestLogger(),
    });

    const first = await onMessage(makeMessage({ text: "book something" }));
    const candidateId = first.quickReplies![1]!.id;
    await onMessage(makeMessage({ quickReplyId: candidateId }));

    expect(calendarProvider.createBookingCalls).toHaveLength(1);
  });

  it("logs both the inbound and outbound message", async () => {
    const logger = new FakeConversationLogger();
    const onMessage = createOnMessageHandler({
      resolveTenant: singleTenant(),
      aiProvider: new FakeAiProvider(),
      sessionStore: new FakeSessionStore(),
      conversationLogger: logger,
      appLogger: createSilentTestLogger(),
    });

    await onMessage(makeMessage({ text: "What are your hours?" }));

    expect(logger.messages).toHaveLength(2);
    expect(logger.messages[0]).toMatchObject({ direction: "inbound", text: "What are your hours?" });
    expect(logger.messages[1]).toMatchObject({ direction: "outbound" });
  });

  it("logs a booking record when a booking is created", async () => {
    const logger = new FakeConversationLogger();
    const onMessage = createOnMessageHandler({
      resolveTenant: singleTenant(),
      aiProvider: new FakeAiProvider(),
      sessionStore: new FakeSessionStore(),
      conversationLogger: logger,
      appLogger: createSilentTestLogger(),
    });

    await onMessage(makeMessage({ text: "book for 4 May at 11am" }));

    expect(logger.bookings).toHaveLength(1);
  });

  it("redacts PII (e.g. a phone number) out of message text before logging it", async () => {
    const logger = new FakeConversationLogger();
    const onMessage = createOnMessageHandler({
      resolveTenant: singleTenant(),
      aiProvider: new FakeAiProvider(),
      sessionStore: new FakeSessionStore(),
      conversationLogger: logger,
      appLogger: createSilentTestLogger(),
    });

    await onMessage(makeMessage({ text: "Call me back at 91234567 please" }));

    expect(logger.messages[0]!.text).toBe("Call me back at [redacted-phone] please");
  });

  it("derives distinct sessions for different channels even with the same senderId string", async () => {
    const sessionStore = new FakeSessionStore();
    const onMessage = createOnMessageHandler({
      resolveTenant: singleTenant(),
      aiProvider: new FakeAiProvider(),
      sessionStore,
      conversationLogger: new FakeConversationLogger(),
      appLogger: createSilentTestLogger(),
    });

    await onMessage(makeMessage({ channel: "whatsapp", senderId: "999", text: "book something" }));
    await onMessage(makeMessage({ channel: "telegram", senderId: "999", text: "book something" }));

    const sessionIds = sessionStore.setCalls.map((c) => c.state.sessionId);
    expect(new Set(sessionIds).size).toBe(2);
  });

  it("derives distinct sessions for different businessChannelIds even with the same sender and channel", async () => {
    const sessionStore = new FakeSessionStore();
    const onMessage = createOnMessageHandler({
      resolveTenant: singleTenant(),
      aiProvider: new FakeAiProvider(),
      sessionStore,
      conversationLogger: new FakeConversationLogger(),
      appLogger: createSilentTestLogger(),
    });

    await onMessage(makeMessage({ businessChannelId: "biz-a", senderId: "999", text: "book something" }));
    await onMessage(makeMessage({ businessChannelId: "biz-b", senderId: "999", text: "book something" }));

    const sessionIds = sessionStore.setCalls.map((c) => c.state.sessionId);
    expect(new Set(sessionIds).size).toBe(2);
  });

  it("replies with a safe fallback and does not throw when no tenant resolves for the businessChannelId", async () => {
    const sessionStore = new FakeSessionStore();
    const onMessage = createOnMessageHandler({
      resolveTenant: () => undefined,
      aiProvider: new FakeAiProvider(),
      sessionStore,
      conversationLogger: new FakeConversationLogger(),
      appLogger: createSilentTestLogger(),
    });

    const response = await onMessage(makeMessage({ businessChannelId: "unknown-number", text: "hi" }));

    expect(response.text).toMatch(/isn't set up/i);
    expect(sessionStore.setCalls).toHaveLength(0);
  });

  it("does not rate limit while under the configured budget", async () => {
    const sessionStore = new FakeSessionStore();
    const rateLimiter = new RedisRateLimiter({ client: new InMemoryRedisLikeClient(), limit: 2, windowSeconds: 60 });
    const onMessage = createOnMessageHandler({
      resolveTenant: singleTenant(),
      aiProvider: new FakeAiProvider(),
      sessionStore,
      conversationLogger: new FakeConversationLogger(),
      appLogger: createSilentTestLogger(),
      rateLimiter,
    });

    const first = await onMessage(makeMessage({ text: "What are your hours?" }));
    expect(first.text).not.toMatch(/sending messages/i);
    expect(sessionStore.setCalls).toHaveLength(1);
  });

  it("replies with a rate-limit message and does no further work once the sender exceeds the budget", async () => {
    const sessionStore = new FakeSessionStore();
    const logger = new FakeConversationLogger();
    const rateLimiter = new RedisRateLimiter({ client: new InMemoryRedisLikeClient(), limit: 1, windowSeconds: 60 });
    const onMessage = createOnMessageHandler({
      resolveTenant: singleTenant(),
      aiProvider: new FakeAiProvider(),
      sessionStore,
      conversationLogger: logger,
      appLogger: createSilentTestLogger(),
      rateLimiter,
    });

    await onMessage(makeMessage({ text: "What are your hours?" }));
    const second = await onMessage(makeMessage({ text: "And your location?" }));

    expect(second.text).toMatch(/sending messages/i);
    // Only the first message's session write/log happened — the rate-limited
    // one never reached the agent, session store, or conversation logger.
    expect(sessionStore.setCalls).toHaveLength(1);
    expect(logger.messages).toHaveLength(2);
  });

  it("rate-limits per chatter, independent of which business (tenant) they're messaging", async () => {
    const rateLimiter = new RedisRateLimiter({ client: new InMemoryRedisLikeClient(), limit: 1, windowSeconds: 60 });
    const onMessage = createOnMessageHandler({
      resolveTenant: singleTenant(),
      aiProvider: new FakeAiProvider(),
      sessionStore: new FakeSessionStore(),
      conversationLogger: new FakeConversationLogger(),
      appLogger: createSilentTestLogger(),
      rateLimiter,
    });

    await onMessage(makeMessage({ businessChannelId: "biz-a", senderId: "999", text: "hi" }));
    const second = await onMessage(makeMessage({ businessChannelId: "biz-b", senderId: "999", text: "hi" }));

    expect(second.text).toMatch(/sending messages/i);
  });
});
