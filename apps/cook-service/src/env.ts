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

export const CookServiceEnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3001),

    OPENAI_API_KEY: z.string().min(1),
    OPENAI_MODEL: z.string().optional(),
    OPENAI_VISION_MODEL: z.string().optional(),

    REDIS_URL: z.string().min(1),
    DATABASE_URL: z.string().min(1),

    /**
     * "Mother's Day Edition" (Milestone 11), fully opt-in — personal recipe
     * retrieval via RAG, queried from a Pinecone index at chat time
     * (populated ahead of time by `provider-recipe-pinecone`'s Drive→Pinecone
     * sync job, run out-of-band — not by this service). Unset by default;
     * when PINECONE_INDEX_NAME is set, PINECONE_API_KEY becomes required too.
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

export type CookServiceEnv = z.infer<typeof CookServiceEnvSchema>;

export function loadEnv(env: NodeJS.ProcessEnv = process.env): CookServiceEnv {
  const result = CookServiceEnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid cook-service environment configuration:\n${issues}`);
  }
  return result.data;
}
