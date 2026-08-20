import { describe, expect, it } from "vitest";
import { RedisRateLimiter } from "./redis-rate-limiter.js";
import { FakeRedisClient } from "./test-support.js";

describe("RedisRateLimiter", () => {
  it("allows hits up to the limit", async () => {
    const client = new FakeRedisClient();
    const limiter = new RedisRateLimiter({ client, limit: 3, windowSeconds: 60 });

    expect((await limiter.hit("telegram:user-1")).limited).toBe(false);
    expect((await limiter.hit("telegram:user-1")).limited).toBe(false);
    expect((await limiter.hit("telegram:user-1")).limited).toBe(false);
  });

  it("flags the hit that exceeds the limit", async () => {
    const client = new FakeRedisClient();
    const limiter = new RedisRateLimiter({ client, limit: 2, windowSeconds: 60 });

    await limiter.hit("telegram:user-1");
    await limiter.hit("telegram:user-1");
    const third = await limiter.hit("telegram:user-1");

    expect(third.limited).toBe(true);
    expect(third.count).toBe(3);
  });

  it("tracks separate windows per key", async () => {
    const client = new FakeRedisClient();
    const limiter = new RedisRateLimiter({ client, limit: 1, windowSeconds: 60 });

    expect((await limiter.hit("telegram:user-1")).limited).toBe(false);
    expect((await limiter.hit("telegram:user-2")).limited).toBe(false);
  });

  it("sets a TTL only on the hit that creates the key, not on every hit", async () => {
    const client = new FakeRedisClient();
    const limiter = new RedisRateLimiter({ client, limit: 5, windowSeconds: 60 });

    await limiter.hit("telegram:user-1");
    await limiter.hit("telegram:user-1");
    await limiter.hit("telegram:user-1");

    expect(client.expireCalls).toHaveLength(1);
    expect(client.expireCalls[0]).toEqual({ key: "gracesoft-sentinel:ratelimit:telegram:user-1", seconds: 60 });
  });
});
