import type { ConversationState, SessionStore } from "@gracesoft-sentinel/core";
import { createRedisClient, type RedisLikeClient } from "./redis-client.js";

const DEFAULT_KEY_PREFIX = "gracesoft-sentinel:session:";

export interface RedisSessionStoreConfig {
  client: RedisLikeClient;
  /** Namespaces session keys within a shared Redis instance. */
  keyPrefix?: string;
}

/**
 * `SessionStore` backed by Redis — the actual persistence layer behind
 * `ConversationState`. Agents never see this class; they consume
 * `SessionStore` (from `core`) only, resolved by whoever composes a
 * service (Milestone 8).
 */
export class RedisSessionStore implements SessionStore {
  private readonly client: RedisLikeClient;
  private readonly keyPrefix: string;

  constructor(config: RedisSessionStoreConfig) {
    this.client = config.client;
    this.keyPrefix = config.keyPrefix ?? DEFAULT_KEY_PREFIX;
  }

  private key(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  async get(sessionId: string): Promise<ConversationState | null> {
    const raw = await this.client.get(this.key(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as ConversationState;
  }

  async set(state: ConversationState, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(state);
    if (ttlSeconds !== undefined) {
      await this.client.setex(this.key(state.sessionId), ttlSeconds, raw);
    } else {
      await this.client.set(this.key(state.sessionId), raw);
    }
  }

  async delete(sessionId: string): Promise<void> {
    await this.client.del(this.key(sessionId));
  }
}

/** Config-driven construction from the process environment. */
export function createRedisSessionStoreFromEnv(env: NodeJS.ProcessEnv): RedisSessionStore {
  const url = env.REDIS_URL;
  if (!url) throw new Error("Missing required env var: REDIS_URL");
  return new RedisSessionStore({ client: createRedisClient(url) });
}
