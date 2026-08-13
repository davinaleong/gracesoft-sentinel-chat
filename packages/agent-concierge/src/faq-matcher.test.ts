import { describe, expect, it } from "vitest";
import { answerFaq } from "./faq-matcher.js";
import { fakeAiProviderAnswering, fakeAiProviderWith, TEST_FAQ_BLUEPRINT } from "./test-support.js";

describe("answerFaq", () => {
  it("returns the model's answer and escalate=false for a well-formed JSON response", async () => {
    const provider = fakeAiProviderAnswering("We're open Monday to Friday 9am-6pm.", false);
    const result = await answerFaq("What are your opening hours?", TEST_FAQ_BLUEPRINT, provider);
    expect(result).toEqual({ text: "We're open Monday to Friday 9am-6pm.", escalate: false });
  });

  it("surfaces escalate=true when the model decides to hand off", async () => {
    const provider = fakeAiProviderAnswering("Let me connect you with the team: hello@example.com", true);
    const result = await answerFaq("Can I speak to a real person?", TEST_FAQ_BLUEPRINT, provider);
    expect(result.escalate).toBe(true);
    expect(result.text).toMatch(/connect you with the team/i);
  });

  it("degrades gracefully to the raw text when the model doesn't return the requested JSON shape", async () => {
    const provider = fakeAiProviderWith(() => ({ text: "We're open 9-6 on weekdays." }));
    const result = await answerFaq("hours?", TEST_FAQ_BLUEPRINT, provider);
    expect(result).toEqual({ text: "We're open 9-6 on weekdays.", escalate: false });
  });

  it("falls back to the blueprint's handoff message when the model returns nothing usable", async () => {
    const provider = fakeAiProviderWith(() => ({ text: "" }));
    const result = await answerFaq("???", TEST_FAQ_BLUEPRINT, provider);
    expect(result.text).toBe(TEST_FAQ_BLUEPRINT.escalation_policy.example_handoff_response);
    expect(result.escalate).toBe(false);
  });

  it("grounds the call in the blueprint's system prompt, knowledge base, and guardrails", async () => {
    const provider = fakeAiProviderAnswering("some answer");
    await answerFaq("What are your opening hours?", TEST_FAQ_BLUEPRINT, provider);

    expect(provider.calls).toHaveLength(1);
    const { messages } = provider.calls[0]!;
    const systemMessage = messages.find((m) => m.role === "system");
    expect(systemMessage?.content).toContain(TEST_FAQ_BLUEPRINT.system_prompt);
    expect(systemMessage?.content).toContain("123 Example Street, Singapore.");
    expect(systemMessage?.content).toContain(TEST_FAQ_BLUEPRINT.guardrails[0]);

    const userMessage = messages.find((m) => m.role === "user");
    expect(userMessage?.content).toBe("What are your opening hours?");
  });
});
