import * as dotenv from "dotenv";
import { resolve } from "path";
import type { AiProvider } from "@sentinel/ai-provider";
dotenv.config({ path: resolve(__dirname, "../../../.env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const PROVIDER_DEFAULTS: Record<AiProvider, string> = {
  openai: "gpt-4o",
  anthropic: "claude-opus-4-5",
};

const AI_KEY_ENV: Record<AiProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

const provider = optional("COOK_AI_PROVIDER", "openai") as AiProvider;

export const cookConfig = {
  aiProvider: provider,
  aiApiKey: required(AI_KEY_ENV[provider]),
  aiModel: optional("COOK_AI_MODEL", PROVIDER_DEFAULTS[provider]),
};
