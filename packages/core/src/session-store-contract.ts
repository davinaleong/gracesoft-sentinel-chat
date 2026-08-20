import { describe, expect, it } from "vitest";
import type { ConversationState } from "./conversation-state.js";
import { ConversationStateSchema } from "./conversation-state.js";
import type { SessionStore } from "./session-store.js";

/**
 * Shared contract test suite for `SessionStore` implementations.
 *
 * Deliberately kept out of `session-store.ts` (and out of the package's
 * main entry point) — see `channel-adapter-contract.ts` for why. Import
 * this only from `@gracesoft-sentinel/core/testing`.
 */
export function runSessionStoreContractTests(name: string, makeStore: () => SessionStore | Promise<SessionStore>): void {
  describe(`SessionStore contract: ${name}`, () => {
    const sample: ConversationState = {
      sessionId: "contract-test-session",
      channel: "whatsapp",
      userId: "user-1",
      agent: "concierge",
      createdAt: "2026-05-01T09:00:00+08:00",
      updatedAt: "2026-05-01T09:00:00+08:00",
      context: { bookingCandidates: [{ id: "slot-1", start: "2026-05-04T09:00:00+08:00", end: "2026-05-04T09:30:00+08:00" }] },
    };

    it("returns null for a session that was never set", async () => {
      const store = await makeStore();
      const result = await store.get("never-set-session-id");
      expect(result).toBeNull();
    });

    it("set then get returns a well-formed, equivalent state", async () => {
      const store = await makeStore();
      await store.set(sample);
      const result = await store.get(sample.sessionId);
      expect(result).not.toBeNull();
      expect(ConversationStateSchema.safeParse(result).success).toBe(true);
      expect(result).toEqual(sample);
    });

    it("set overwrites a previous state for the same sessionId", async () => {
      const store = await makeStore();
      await store.set(sample);
      const updated: ConversationState = { ...sample, context: { lastEscalatedMessage: "Do you sell coffee?" } };
      await store.set(updated);
      const result = await store.get(sample.sessionId);
      expect(result?.context).toEqual({ lastEscalatedMessage: "Do you sell coffee?" });
    });

    it("delete removes a previously set session", async () => {
      const store = await makeStore();
      await store.set(sample);
      await store.delete(sample.sessionId);
      const result = await store.get(sample.sessionId);
      expect(result).toBeNull();
    });
  });
}
