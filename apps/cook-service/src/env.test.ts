import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const BASE_ENV = {
  OPENAI_API_KEY: "sk-test",
  REDIS_URL: "redis://localhost:6379",
  DATABASE_URL: "postgres://localhost:5432/db",
};

describe("loadEnv", () => {
  it("loads successfully with Telegram enabled and its required vars present", () => {
    const env = loadEnv({
      ...BASE_ENV,
      TELEGRAM_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "t",
      TELEGRAM_WEBHOOK_SECRET: "s",
    } as unknown as NodeJS.ProcessEnv);
    expect(env.TELEGRAM_ENABLED).toBe(true);
    expect(env.PORT).toBe(3001);
  });

  it("throws when no channel is enabled", () => {
    expect(() => loadEnv({ ...BASE_ENV } as unknown as NodeJS.ProcessEnv)).toThrow(/WHATSAPP_ENABLED or TELEGRAM_ENABLED/);
  });

  it("throws when WHATSAPP_ENABLED is true but its required vars are missing", () => {
    expect(() => loadEnv({ ...BASE_ENV, WHATSAPP_ENABLED: "true" } as unknown as NodeJS.ProcessEnv)).toThrow(
      /WHATSAPP_PHONE_NUMBER_ID is required/
    );
  });

  it("throws when GOOGLE_DRIVE_RECIPES_FOLDER_ID is set but the Google service account vars are missing", () => {
    expect(() =>
      loadEnv({
        ...BASE_ENV,
        TELEGRAM_ENABLED: "true",
        TELEGRAM_BOT_TOKEN: "t",
        TELEGRAM_WEBHOOK_SECRET: "s",
        GOOGLE_DRIVE_RECIPES_FOLDER_ID: "folder-1",
      } as unknown as NodeJS.ProcessEnv)
    ).toThrow(/GOOGLE_SERVICE_ACCOUNT_EMAIL is required/);
  });

  it("loads successfully with the Mother's Day Edition fully configured", () => {
    const env = loadEnv({
      ...BASE_ENV,
      TELEGRAM_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "t",
      TELEGRAM_WEBHOOK_SECRET: "s",
      GOOGLE_DRIVE_RECIPES_FOLDER_ID: "folder-1",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "svc@example.iam.gserviceaccount.com",
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "key",
    } as unknown as NodeJS.ProcessEnv);
    expect(env.GOOGLE_DRIVE_RECIPES_FOLDER_ID).toBe("folder-1");
  });
});
