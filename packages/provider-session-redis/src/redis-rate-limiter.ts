import { createRedisClient, type RedisLikeClient } from "./redis-client.js";

const DEFAULT_KEY_PREFIX = "gracesoft-sentinel:ratelimit:";

export interface RedisRateLimiterConfig {
  client: RedisLikeClient;
  /** How many `hit()` calls are allowed within one window. */
  limit: number;
  windowSeconds: number;
  keyPrefix?: string;
}

/**
 * Fixed-window rate limiter — a floor against a single chatter (or bot)
 * flooding the agent with messages, independent of the webhook's own
 * per-source-IP limiter (which only protects against volume at the HTTP
 * layer; all legitimate Telegram/WhatsApp traffic already arrives from a
 * shared pool of platform IPs, so it can't distinguish one abusive chatter
 * from another). `key` is caller-supplied (e.g. `${channel}:${senderId}`)
 * so this stays reusable across both `concierge-service` and
 * `cook-service` without knowing anything about channels itself.
 *
 * Fixed-window, not sliding: simpler (one INCR + one conditional EXPIRE,
 * no sorted sets) and precise enough for "stop a flood", which doesn't
 * need exact fairness at the window boundary.
 */
export class RedisRateLimiter {
  private readonly client: RedisLikeClient;
  private readonly limit: number;
  private readonly windowSeconds: number;
  private readonly keyPrefix: string;

  constructor(config: RedisRateLimiterConfig) {
    this.client = config.client;
    this.limit = config.limit;
    this.windowSeconds = config.windowSeconds;
    this.keyPrefix = config.keyPrefix ?? DEFAULT_KEY_PREFIX;
  }

  /** Records one hit for `key` and reports whether it exceeds the limit for the current window. */
  async hit(key: string): Promise<{ limited: boolean; count: number }> {
    const redisKey = `${this.keyPrefix}${key}`;
    const count = await this.client.incr(redisKey);
    if (count === 1) {
      // Only the request that created the key sets its TTL — an EXPIRE on
      // every hit would keep pushing the window out, turning "fixed" into
      // "sliding" by accident and letting a steady drip of messages evade
      // the limit forever.
      await this.client.expire(redisKey, this.windowSeconds);
    }
    return { limited: count > this.limit, count };
  }
}

/** Config-driven construction from the process environment, mirroring `createRedisSessionStoreFromEnv`. */
export function createRedisRateLimiterFromEnv(
  env: NodeJS.ProcessEnv,
  options: { limit: number; windowSeconds: number; keyPrefix?: string }
): RedisRateLimiter {
  const url = env.REDIS_URL;
  if (!url) throw new Error("Missing required env var: REDIS_URL");
  return new RedisRateLimiter({ client: createRedisClient(url), ...options });
}
