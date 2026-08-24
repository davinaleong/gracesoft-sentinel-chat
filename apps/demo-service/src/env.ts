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
 * demo-service is deliberately single-tenant, single-business-config only
 * (no BUSINESS_CONFIGS_DIR multi-tenant mode) — its whole purpose is
 * demoing Concierge and Cook side by side in one chat window, not serving
 * real multi-business traffic.
 */
export const DemoServiceEnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3003),

    OPENAI_API_KEY: z.string().min(1),
    OPENAI_MODEL: z.string().optional(),
    OPENAI_VISION_MODEL: z.string().optional(),

    GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().min(1),
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().min(1),

    REDIS_URL: z.string().min(1),
    DATABASE_URL: z.string().min(1),

    /** Path to a JSON file matching core's BusinessConfigSchema — used for the Concierge half only. */
    BUSINESS_CONFIG_PATH: z.string().min(1),

    /** Which agent a chatter talks to before ever explicitly switching. */
    DEMO_DEFAULT_AGENT: z.enum(["concierge", "cook"]).default("concierge"),

    /**
     * "Mother's Day Edition" (opt-in): personal recipe retrieval via RAG,
     * queried from a Pinecone index, for the Cook half. This service only
     * queries the index — it's populated ahead of time by
     * `provider-recipe-pinecone`'s own Drive→Pinecone sync job, run
     * out-of-band. Unset by default; when PINECONE_INDEX_NAME is set,
     * PINECONE_API_KEY becomes required too.
     */
    PINECONE_API_KEY: z.string().optional(),
    PINECONE_INDEX_NAME: z.string().optional(),
    /** Keeps recipe vectors isolated from anything else sharing the same index — recommended, not required. */
    PINECONE_NAMESPACE: z.string().optional(),

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
    if (env.PINECONE_INDEX_NAME && !env.PINECONE_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["PINECONE_API_KEY"], message: "PINECONE_API_KEY is required when PINECONE_INDEX_NAME is set" });
    }
  });

export type DemoServiceEnv = z.infer<typeof DemoServiceEnvSchema>;

export function loadEnv(env: NodeJS.ProcessEnv = process.env): DemoServiceEnv {
  const result = DemoServiceEnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid demo-service environment configuration:\n${issues}`);
  }
  return result.data;
}
