import type { ConversationState } from "./conversation-state.js";
import type { SessionStore } from "./session-store.js";
import { runSessionStoreContractTests } from "./session-store-contract.js";

/**
 * Trivial in-memory store, used only to prove the contract suite itself is
 * correct. The real Redis-backed store is wired up in Milestone 8.
 */
class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, ConversationState>();

  async get(sessionId: string): Promise<ConversationState | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async set(state: ConversationState): Promise<void> {
    this.sessions.set(state.sessionId, state);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

runSessionStoreContractTests("InMemorySessionStore (self-test)", () => new InMemorySessionStore());
