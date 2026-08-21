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
  /**
   * How many days ahead a chatter may book or reschedule into, e.g. 60 —
   * the outer edge of the slot engine's own search horizon (see
   * `DEFAULT_HORIZON_DAYS`). Unset means no cap beyond that default.
   */
  maxBookingHorizonDays: z.number().int().positive().optional(),
});
export type BusinessConfig = z.infer<typeof BusinessConfigSchema>;
