import { describe, expect, it } from "vitest";
import { runSessionStoreContractTests } from "@gracesoft-sentinel/core";
import type { ConversationState } from "@gracesoft-sentinel/core";
import { RedisSessionStore, createRedisSessionStoreFromEnv } from "./redis-session-store.js";
import { FakeRedisClient } from "./test-support.js";

runSessionStoreContractTests(
  "RedisSessionStore (fake client)",
  () => new RedisSessionStore({ client: new FakeRedisClient() })
);

const SAMPLE: ConversationState = {
  sessionId: "sess-1",
  channel: "whatsapp",
  userId: "user-1",
  agent: "concierge",
  createdAt: "2026-05-01T09:00:00+08:00",
  updatedAt: "2026-05-01T09:00:00+08:00",
  context: {},
};

describe("RedisSessionStore — TTL and key namespacing", () => {
  it("passes the TTL through to setex when provided", async () => {
    const client = new FakeRedisClient();
    const store = new RedisSessionStore({ client });
    await store.set(SAMPLE, 3600);
    expect(client.setexCalls).toEqual([{ key: "gracesoft-sentinel:session:sess-1", seconds: 3600 }]);
  });

  it("uses a plain set (no expiry) when no TTL is given", async () => {
    const client = new FakeRedisClient();
    const store = new RedisSessionStore({ client });
    await store.set(SAMPLE);
    expect(client.setexCalls).toHaveLength(0);
    expect(await store.get(SAMPLE.sessionId)).toEqual(SAMPLE);
  });

  it("namespaces keys with a custom prefix", async () => {
    const client = new FakeRedisClient();
    const store = new RedisSessionStore({ client, keyPrefix: "cook-service:session:" });
    await store.set(SAMPLE, 60);
    expect(client.setexCalls[0]!.key).toBe("cook-service:session:sess-1");
  });
});

describe("createRedisSessionStoreFromEnv", () => {
  it("throws a clear error when REDIS_URL is missing", () => {
    expect(() => createRedisSessionStoreFromEnv({} as NodeJS.ProcessEnv)).toThrow(/REDIS_URL/);
  });
});
