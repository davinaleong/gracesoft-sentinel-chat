import { z } from "zod";
import { BusinessHoursSchema } from "./calendar-provider.js";

/**
 * One config shape both `agent-concierge` and `agent-cook` consume —
 * per-business, resolved by the service-wiring layer (Milestone 8), not
 * hardcoded into either agent.
 */
export const BusinessConfigSchema = z.object({
  businessId: z.string(),
  /** IANA timezone, e.g. "Asia/Singapore". */
  timezone: z.string(),
  /** Path to the FAQ blueprint this business's Concierge agent should use. */
  faqBlueprintPath: z.string(),
  calendarId: z.string(),
  businessHours: BusinessHoursSchema,
});
export type BusinessConfig = z.infer<typeof BusinessConfigSchema>;
