import { z } from "zod";

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
     * retrieval via RAG over a Google Drive folder. Unset by default; when
     * GOOGLE_DRIVE_RECIPES_FOLDER_ID is set, the two service-account vars
     * become required too.
     */
    GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional(),
    GOOGLE_DRIVE_RECIPES_FOLDER_ID: z.string().optional(),

    WHATSAPP_ENABLED: z.coerce.boolean().default(false),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

    TELEGRAM_ENABLED: z.coerce.boolean().default(false),
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
    if (env.GOOGLE_DRIVE_RECIPES_FOLDER_ID) {
      for (const key of ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when GOOGLE_DRIVE_RECIPES_FOLDER_ID is set` });
      }
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
