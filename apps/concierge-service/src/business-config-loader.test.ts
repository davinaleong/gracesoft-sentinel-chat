import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadBusinessConfig, loadFaqBlueprint } from "./business-config-loader.js";

const VALID_BUSINESS_CONFIG = {
  businessId: "test-biz",
  timezone: "Asia/Singapore",
  faqBlueprintPath: "./faq-blueprint.json",
  calendarId: "test-calendar",
  businessHours: {
    timezone: "Asia/Singapore",
    weekly: {
      mon: { open: "09:00", close: "18:00" },
      tue: { open: "09:00", close: "18:00" },
      wed: { open: "09:00", close: "18:00" },
      thu: { open: "09:00", close: "18:00" },
      fri: { open: "09:00", close: "18:00" },
      sat: { open: "09:00", close: "13:00" },
      sun: null,
    },
    exceptions: [],
  },
};

const VALID_FAQ_BLUEPRINT = {
  system_prompt: "You are a test assistant.",
  ai_disclosure: { required: true, opening_message: "Hi, I'm an AI." },
  knowledge_base: {},
  guardrails: [],
  escalation_policy: { conditions: [], handoff_instruction: "", example_handoff_response: "" },
};

describe("loadBusinessConfig / loadFaqBlueprint", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "concierge-service-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads and validates a well-formed BusinessConfig file", () => {
    const path = join(dir, "business-config.json");
    writeFileSync(path, JSON.stringify(VALID_BUSINESS_CONFIG));
    const config = loadBusinessConfig(path);
    expect(config.businessId).toBe("test-biz");
    expect(config.businessHours.exceptions).toEqual([]);
  });

  it("throws a clear error for a malformed BusinessConfig file", () => {
    const path = join(dir, "business-config.json");
    writeFileSync(path, JSON.stringify({ businessId: "missing-everything-else" }));
    expect(() => loadBusinessConfig(path)).toThrow();
  });

  it("loads the FAQ blueprint relative to the business config file's directory", () => {
    const configPath = join(dir, "business-config.json");
    writeFileSync(configPath, JSON.stringify(VALID_BUSINESS_CONFIG));
    writeFileSync(join(dir, "faq-blueprint.json"), JSON.stringify(VALID_FAQ_BLUEPRINT));

    const businessConfig = loadBusinessConfig(configPath);
    const faqBlueprint = loadFaqBlueprint(configPath, businessConfig);
    expect(faqBlueprint.system_prompt).toBe("You are a test assistant.");
  });
});
