import { z } from "zod";

export const LegalSiteEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3002),
});

export type LegalSiteEnv = z.infer<typeof LegalSiteEnvSchema>;

export function loadEnv(env: NodeJS.ProcessEnv = process.env): LegalSiteEnv {
  const result = LegalSiteEnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid legal-site environment configuration:\n${issues}`);
  }
  return result.data;
}
