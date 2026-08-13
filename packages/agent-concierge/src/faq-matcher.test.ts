import { describe, expect, it } from "vitest";
import { matchFaq } from "./faq-matcher.js";
import { TEST_FAQ_BLUEPRINT } from "./test-support.js";

describe("matchFaq", () => {
  it("returns the correct blueprint answer for a known question", () => {
    const result = matchFaq("What are your opening hours?", TEST_FAQ_BLUEPRINT);
    expect(result?.entry.id).toBe("faq-hours");
  });

  it("matches on keyword overlap even with different phrasing", () => {
    const result = matchFaq("what time do you open", TEST_FAQ_BLUEPRINT);
    expect(result?.entry.id).toBe("faq-hours");
  });

  it("returns null (escalate) for a question with no confident match", () => {
    const result = matchFaq("Do you sell coffee?", TEST_FAQ_BLUEPRINT);
    expect(result).toBeNull();
  });

  it("returns null (escalate) rather than a shaky low-confidence answer", () => {
    const result = matchFaq("hi", TEST_FAQ_BLUEPRINT, 0.5);
    expect(result).toBeNull();
  });

  it("respects a custom confidence threshold", () => {
    const lenient = matchFaq("address please", TEST_FAQ_BLUEPRINT, 0.05);
    expect(lenient?.entry.id).toBe("faq-location");

    const strict = matchFaq("address please", TEST_FAQ_BLUEPRINT, 0.9);
    expect(strict).toBeNull();
  });
});
