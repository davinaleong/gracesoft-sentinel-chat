import type { RedisLikeClient } from "./redis-client.js";

/** In-memory stand-in for Redis — no network involved, tracks TTLs for assertions. */
export class FakeRedisClient implements RedisLikeClient {
  private readonly store = new Map<string, string>();
  public setexCalls: { key: string; seconds: number }[] = [];

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<unknown> {
    this.store.set(key, value);
    return "OK";
  }

  async setex(key: string, seconds: number, value: string): Promise<unknown> {
    this.setexCalls.push({ key, seconds });
    this.store.set(key, value);
    return "OK";
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}
