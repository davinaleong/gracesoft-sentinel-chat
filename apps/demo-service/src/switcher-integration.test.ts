import { describe, expect, it } from "vitest";
import type { NormalizedMessage } from "@gracesoft-sentinel/core";
import { createAgentSwitcher } from "@gracesoft-sentinel/agent-switcher";
import { createConciergeOnMessageHandler } from "./concierge-on-message.js";
import { createCookOnMessageHandler } from "./cook-on-message.js";
import {
  FakeAiProvider,
  FakeCalendarProvider,
  FakeConversationLogger,
  FakeSessionStore,
  TEST_BUSINESS_CONFIG,
  TEST_FAQ_BLUEPRINT,
  createSilentTestLogger,
} from "./test-support.js";

/**
 * Proves the actual demo-service wiring — not just agent-switcher's own
 * isolated unit tests (which use trivial fake agents) — correctly switches
 * between two *real* agents (agent-concierge, agent-cook) built the same
 * way composition.ts builds them, sharing one SessionStore.
 */
function makeMessage(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return { id: "msg-1", channel: "telegram", senderId: "chatter-1", timestamp: new Date().toISOString(), raw: {}, ...overrides };
}

function buildTestSwitcher() {
  const aiProvider = new FakeAiProvider();
  const sessionStore = new FakeSessionStore();
  const conversationLogger = new FakeConversationLogger();
  const appLogger = createSilentTestLogger();

  const conciergeOnMessage = createConciergeOnMessageHandler({
    businessConfig: TEST_BUSINESS_CONFIG,
    faqBlueprint: TEST_FAQ_BLUEPRINT,
    calendarProvider: new FakeCalendarProvider(),
    aiProvider,
    sessionStore,
    conversationLogger,
    appLogger,
  });
  const cookOnMessage = createCookOnMessageHandler({ aiProvider, sessionStore, conversationLogger, appLogger });

  const onMessage = createAgentSwitcher({
    agents: [
      { name: "concierge", label: "Sentinel Concierge", triggers: ["/concierge", "concierge"], onMessage: conciergeOnMessage },
      { name: "cook", label: "Sentinel Cook", triggers: ["/cook", "cook"], onMessage: cookOnMessage },
    ],
    defaultAgent: "concierge",
    sessionStore,
  });

  return { onMessage, aiProvider, conversationLogger };
}

describe("demo-service — switching between real agent-concierge and agent-cook", () => {
  it("starts on the default agent (concierge) and stays there without an explicit switch", async () => {
    const { onMessage } = buildTestSwitcher();
    const response = await onMessage(makeMessage({ text: "Do you sell coffee?" }));
    // TEST_FAQ_BLUEPRINT's ai_disclosure is disabled, so this is a plain FAQ answer, not a cook-shaped one.
    expect(response.text).toBe("fake answer");
  });

  it("switches to Cook via command, and the switch confirmation isn't itself forwarded to either agent", async () => {
    const { onMessage, aiProvider } = buildTestSwitcher();
    const response = await onMessage(makeMessage({ text: "/cook" }));
    expect(response.text).toContain("Sentinel Cook");
    expect(aiProvider.calls).toHaveLength(0);
  });

  it("routes a photo to Cook after switching, producing a recipe-shaped reply, not a Concierge FAQ answer", async () => {
    const { onMessage } = buildTestSwitcher();
    await onMessage(makeMessage({ text: "/cook" }));

    const response = await onMessage(
      makeMessage({ text: undefined, media: [{ type: "image", url: "data:image/png;base64,abc", mimeType: "image/png" }] })
    );
    expect(response.text).toContain("Chicken Rice");
  });

  it("switches back to Concierge and its own conversation state survived the detour to Cook untouched", async () => {
    const { onMessage } = buildTestSwitcher();

    // Offered 3 slots on Concierge (the default agent) — "book something"
    // matches the booking-intent keyword with no date/time given.
    const offer = await onMessage(makeMessage({ text: "book something" }));
    expect(offer.quickReplies).toHaveLength(3);

    // Detour to Cook and back.
    await onMessage(makeMessage({ text: "/cook" }));
    await onMessage(makeMessage({ text: "what can I make with eggs?" }));
    const back = await onMessage(makeMessage({ text: "/concierge" }));
    expect(back.text).toContain("Sentinel Concierge");

    // Picking "the first one" only resolves to an actual booking if
    // Concierge's own candidate-slot state from before the detour to Cook
    // is still there — proves the switcher didn't clobber it.
    const resumed = await onMessage(makeMessage({ text: "the first one" }));
    expect(resumed.text).toMatch(/booked/i);
  });

  it("logs each turn under the correct agent name, not always whichever was active last", async () => {
    const { onMessage, conversationLogger } = buildTestSwitcher();
    await onMessage(makeMessage({ text: "/cook" }));
    await onMessage(makeMessage({ text: "what can I make with eggs?" }));

    const cookEntries = conversationLogger.messages.filter((m) => m.agent === "cook");
    const conciergeEntries = conversationLogger.messages.filter((m) => m.agent === "concierge");
    expect(cookEntries.length).toBeGreaterThan(0);
    expect(conciergeEntries).toHaveLength(0); // switching to cook never touched concierge's own on-message handler
  });
});
