import type { ConversationState } from "./conversation-state.js";

/**
 * Session-persistence capability surface — the Redis-backed store
 * (Milestone 8) implements this, but nothing in the composition root or
 * either agent should depend on Redis directly. `set` accepts an optional
 * TTL since sessions are expected to expire, not accumulate forever.
 */
export interface SessionStore {
  get(sessionId: string): Promise<ConversationState | null>;
  set(state: ConversationState, ttlSeconds?: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
}
