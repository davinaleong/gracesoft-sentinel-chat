import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { BusinessConfigSchema, type BusinessConfig } from "@gracesoft-sentinel/core";
import type { FaqGroundingBlueprint } from "@gracesoft-sentinel/agent-concierge";

/**
 * Deliberately single-tenant only — see apps/concierge-service's own
 * business-config-loader.ts for the multi-tenant registry version this
 * intentionally doesn't need (demo-service serves one business config for
 * its Concierge half).
 */
export function loadBusinessConfig(path: string): BusinessConfig {
  const raw: unknown = JSON.parse(readFileSync(path, "utf-8"));
  return BusinessConfigSchema.parse(raw);
}

export function loadFaqBlueprint(businessConfigPath: string, businessConfig: BusinessConfig): FaqGroundingBlueprint {
  const faqPath = resolve(dirname(businessConfigPath), businessConfig.faqBlueprintPath);
  return JSON.parse(readFileSync(faqPath, "utf-8")) as FaqGroundingBlueprint;
}
