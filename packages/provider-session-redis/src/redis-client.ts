import { Redis } from "ioredis";

/**
 * The minimal slice of a Redis client `RedisSessionStore` actually calls —
 * kept as our own small interface (rather than depending on the full
 * `ioredis` client surface everywhere) so tests can substitute an
 * in-memory fake without a real Redis server.
 */
export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<number>;
}

/** Builds the real `ioredis` client from a connection URL. */
export function createRedisClient(url: string): RedisLikeClient {
  return new Redis(url);
}
