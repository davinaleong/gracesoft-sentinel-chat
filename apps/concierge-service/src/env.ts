import { z } from "zod";

/**
 * `z.coerce.boolean()` is just `Boolean(value)` under the hood — for a
 * string env var, that makes the literal string "false" coerce to `true`
 * (any non-empty string is truthy), silently ignoring an explicit
 * WHATSAPP_ENABLED=false. Parse the two expected string values explicitly
 * instead, so a real "false" is actually respected and anything else is a
 * clear validation error rather than a silent yes.
 */
const booleanFromEnvString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

/**
 * Env validation via Zod, fails fast at startup with a clear error rather
 * than surfacing a confusing failure deep in a request handler later.
 */
export const ConciergeServiceEnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),

    OPENAI_API_KEY: z.string().min(1),
    OPENAI_MODEL: z.string().optional(),
    OPENAI_VISION_MODEL: z.string().optional(),

    GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().min(1),
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().min(1),

    REDIS_URL: z.string().min(1),
    DATABASE_URL: z.string().min(1),

    /** Single-tenant mode: path to a JSON file matching core's BusinessConfigSchema. */
    BUSINESS_CONFIG_PATH: z.string().min(1).optional(),
    /**
     * Multi-tenant mode: a directory of BusinessConfig JSON files, one per
     * business, each named `<businessChannelId>.json` (the WhatsApp
     * `phone_number_id` or Twilio `To` number that routes to that business —
     * see `NormalizedMessage.businessChannelId`). Takes precedence over
     * BUSINESS_CONFIG_PATH when both are set.
     */
    BUSINESS_CONFIGS_DIR: z.string().min(1).optional(),

    WHATSAPP_ENABLED: booleanFromEnvString,
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

    TELEGRAM_ENABLED: booleanFromEnvString,
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.WHATSAPP_ENABLED) {
      for (const key of ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when WHATSAPP_ENABLED=true` });
      }
    }
    if (env.TELEGRAM_ENABLED) {
      for (const key of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when TELEGRAM_ENABLED=true` });
      }
    }
    if (!env.WHATSAPP_ENABLED && !env.TELEGRAM_ENABLED) {
      ctx.addIssue({ code: "custom", path: ["WHATSAPP_ENABLED"], message: "At least one of WHATSAPP_ENABLED or TELEGRAM_ENABLED must be true" });
    }
    if (!env.BUSINESS_CONFIG_PATH && !env.BUSINESS_CONFIGS_DIR) {
      ctx.addIssue({
        code: "custom",
        path: ["BUSINESS_CONFIG_PATH"],
        message: "At least one of BUSINESS_CONFIG_PATH or BUSINESS_CONFIGS_DIR must be set",
      });
    }
  });

export type ConciergeServiceEnv = z.infer<typeof ConciergeServiceEnvSchema>;

export function loadEnv(env: NodeJS.ProcessEnv = process.env): ConciergeServiceEnv {
  const result = ConciergeServiceEnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid concierge-service environment configuration:\n${issues}`);
  }
  return result.data;
}
