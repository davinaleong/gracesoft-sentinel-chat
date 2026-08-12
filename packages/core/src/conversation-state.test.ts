import { describe, expect, it } from "vitest";
import { ConversationStateSchema } from "./conversation-state.js";

describe("ConversationStateSchema", () => {
  it("accepts a session with agent-defined context", () => {
    const result = ConversationStateSchema.safeParse({
      sessionId: "sess-1",
      channel: "whatsapp",
      userId: "+6591234567",
      agent: "concierge",
      createdAt: "2026-05-01T09:00:00+08:00",
      updatedAt: "2026-05-01T09:00:00+08:00",
      context: { bookingInProgress: { candidateSlots: ["2026-05-04T10:00:00+08:00"] } },
    });
    expect(result.success).toBe(true);
  });

  it("defaults context to an empty object when omitted", () => {
    const result = ConversationStateSchema.parse({
      sessionId: "sess-2",
      channel: "telegram",
      userId: "123456",
      agent: "cook",
      createdAt: "2026-05-01T09:00:00+08:00",
      updatedAt: "2026-05-01T09:00:00+08:00",
    });
    expect(result.context).toEqual({});
  });
});
