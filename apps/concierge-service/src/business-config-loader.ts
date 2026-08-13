import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { BusinessConfigSchema, type BusinessConfig } from "@gracesoft-sentinel/core";
import type { FaqGroundingBlueprint } from "@gracesoft-sentinel/agent-concierge";

/** Loads and validates a `BusinessConfig` JSON file against core's own schema — fails fast on a malformed file. */
export function loadBusinessConfig(path: string): BusinessConfig {
  const raw: unknown = JSON.parse(readFileSync(path, "utf-8"));
  return BusinessConfigSchema.parse(raw);
}

/**
 * Loads the FAQ grounding blueprint referenced by `businessConfig.faqBlueprintPath`,
 * resolved relative to the business config file itself. No Zod schema owns this
 * shape — it's business-owned content (see `_internal-docs/data/faq-blueprint.json`),
 * not a `core` contract, so this is a structural trust boundary, not a validated one.
 */
export function loadFaqBlueprint(businessConfigPath: string, businessConfig: BusinessConfig): FaqGroundingBlueprint {
  const faqPath = resolve(dirname(businessConfigPath), businessConfig.faqBlueprintPath);
  return JSON.parse(readFileSync(faqPath, "utf-8")) as FaqGroundingBlueprint;
}
