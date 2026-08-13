import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const BASE_ENV = {
  OPENAI_API_KEY: "sk-test",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "svc@example.iam.gserviceaccount.com",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "key",
  REDIS_URL: "redis://localhost:6379",
  DATABASE_URL: "postgres://localhost:5432/db",
  BUSINESS_CONFIG_PATH: "./business-config.json",
};

describe("loadEnv", () => {
  it("loads successfully with WhatsApp enabled and its required vars present", () => {
    const env = loadEnv({
      ...BASE_ENV,
      WHATSAPP_ENABLED: "true",
      WHATSAPP_PHONE_NUMBER_ID: "1",
      WHATSAPP_ACCESS_TOKEN: "t",
      WHATSAPP_APP_SECRET: "s",
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: "v",
    } as unknown as NodeJS.ProcessEnv);
    expect(env.WHATSAPP_ENABLED).toBe(true);
    expect(env.PORT).toBe(3000);
  });

  it("throws when no channel is enabled", () => {
    expect(() => loadEnv({ ...BASE_ENV } as unknown as NodeJS.ProcessEnv)).toThrow(/WHATSAPP_ENABLED or TELEGRAM_ENABLED/);
  });

  it("throws when WHATSAPP_ENABLED is true but its required vars are missing", () => {
    expect(() => loadEnv({ ...BASE_ENV, WHATSAPP_ENABLED: "true" } as unknown as NodeJS.ProcessEnv)).toThrow(
      /WHATSAPP_PHONE_NUMBER_ID is required/
    );
  });

  it("throws when TELEGRAM_ENABLED is true but its required vars are missing", () => {
    expect(() => loadEnv({ ...BASE_ENV, TELEGRAM_ENABLED: "true" } as unknown as NodeJS.ProcessEnv)).toThrow(
      /TELEGRAM_BOT_TOKEN is required/
    );
  });

  it("throws when a base required var (e.g. OPENAI_API_KEY) is missing", () => {
    const { OPENAI_API_KEY: _drop, ...rest } = BASE_ENV;
    expect(() =>
      loadEnv({ ...rest, TELEGRAM_ENABLED: "true", TELEGRAM_BOT_TOKEN: "t", TELEGRAM_WEBHOOK_SECRET: "s" } as unknown as NodeJS.ProcessEnv)
    ).toThrow(/Invalid concierge-service environment configuration/);
  });

  it("respects a custom PORT", () => {
    const env = loadEnv({
      ...BASE_ENV,
      PORT: "8080",
      TELEGRAM_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "t",
      TELEGRAM_WEBHOOK_SECRET: "s",
    } as unknown as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(8080);
  });
});
