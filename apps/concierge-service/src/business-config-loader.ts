import { readdirSync, readFileSync } from "node:fs";
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

/**
 * Applies a deployment-wide default for `maxBookingHorizonDays` when a
 * business config doesn't set its own — an ops-level fallback (see
 * `DEFAULT_MAX_BOOKING_HORIZON_DAYS` in env.ts) so a cap can be set
 * without editing every tenant's JSON file. A business's own value, once
 * set, always wins.
 */
export function withDefaultMaxBookingHorizon(businessConfig: BusinessConfig, defaultMaxBookingHorizonDays: number | undefined): BusinessConfig {
  if (businessConfig.maxBookingHorizonDays !== undefined || defaultMaxBookingHorizonDays === undefined) {
    return businessConfig;
  }
  return { ...businessConfig, maxBookingHorizonDays: defaultMaxBookingHorizonDays };
}

export interface TenantConfig {
  businessConfig: BusinessConfig;
  faqBlueprint: FaqGroundingBlueprint;
}

/**
 * Multi-tenant loader: reads every `<businessChannelId>.json` file directly
 * inside `dir` (e.g. `1234567890.json` for a WhatsApp `phone_number_id`, or
 * `+18885550000.json` for a Twilio number) and keys each business's config
 * by that filename stem — the same value `NormalizedMessage.businessChannelId`
 * carries at message time, so resolution is a plain map lookup.
 *
 * `readdirSync` here is non-recursive, so each business's FAQ blueprint must
 * live in a nested subdirectory (e.g. `faqBlueprintPath: "./faq-blueprints/biz-a.json"`)
 * rather than directly inside `dir` — otherwise it would itself be read as a
 * (malformed) BusinessConfig file and fail validation.
 */
export function loadBusinessConfigRegistry(dir: string): Map<string, TenantConfig> {
  const registry = new Map<string, TenantConfig>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const path = resolve(dir, file);
    const businessConfig = loadBusinessConfig(path);
    const faqBlueprint = loadFaqBlueprint(path, businessConfig);
    const businessChannelId = file.slice(0, -".json".length);
    registry.set(businessChannelId, { businessConfig, faqBlueprint });
  }
  return registry;
}
