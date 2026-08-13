import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadBusinessConfig, loadFaqBlueprint } from "./business-config-loader.js";

/**
 * Proves the real example config committed at `_internal-docs/data/` (built
 * from the actual GraceSoft FAQ blueprint + Singapore public holiday CSVs)
 * is genuinely valid against `BusinessConfigSchema`, not just hand-typed
 * and hoped-for.
 */
describe("the real business-config.example.json", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, "../../../_internal-docs/data/business-config.example.json");

  it("loads and validates against BusinessConfigSchema", () => {
    const config = loadBusinessConfig(path);
    expect(config.businessId).toBe("gracesoft");
    expect(config.businessHours.exceptions.length).toBeGreaterThan(20);
  });

  it("resolves and loads the real FAQ grounding blueprint", () => {
    const config = loadBusinessConfig(path);
    const faqBlueprint = loadFaqBlueprint(path, config);
    expect(faqBlueprint.ai_disclosure.required).toBe(true);
    expect(faqBlueprint.knowledge_base).toBeDefined();
  });
});
