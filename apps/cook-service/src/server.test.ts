import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { CookServiceEnv } from "./env.js";
import { buildServer } from "./server.js";
import { createSilentTestLogger } from "./test-support.js";

const BASE_ENV: CookServiceEnv = {
  PORT: 0,
  OPENAI_API_KEY: "sk-test",
  REDIS_URL: "redis://localhost:6379",
  DATABASE_URL: "postgres://localhost:5432/db",
  WHATSAPP_ENABLED: false,
  TELEGRAM_ENABLED: true,
  TELEGRAM_BOT_TOKEN: "t",
  TELEGRAM_WEBHOOK_SECRET: "s",
};

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

async function listen(env: CookServiceEnv): Promise<string> {
  const app = buildServer({
    env,
    onMessage: async () => ({ text: "unused" }),
    readinessCheck: async () => true,
    appLogger: createSilentTestLogger(),
  });
  server = createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const { port } = server!.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("buildServer — health/readiness", () => {
  it("GET /health always returns ok", async () => {
    const baseUrl = await listen(BASE_ENV);
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("GET /ready returns 503 when the readiness check fails", async () => {
    const app = buildServer({
      env: BASE_ENV,
      onMessage: async () => ({ text: "unused" }),
      readinessCheck: async () => {
        throw new Error("postgres unreachable");
      },
      appLogger: createSilentTestLogger(),
    });
    server = createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server!.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/ready`);
    expect(res.status).toBe(503);
  });
});

describe("buildServer — conditional channel mounting", () => {
  it("mounts the Telegram webhook route when TELEGRAM_ENABLED", async () => {
    const baseUrl = await listen(BASE_ENV);
    const res = await fetch(`${baseUrl}/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(403);
  });
});

describe("buildServer — rate limiting", () => {
  it("doesn't crash on a request carrying X-Forwarded-For (regression: ERR_ERL_UNEXPECTED_X_FORWARDED_FOR without app.set('trust proxy', ...))", async () => {
    const baseUrl = await listen(BASE_ENV);
    const res = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.1" },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });

  it("rate limits the webhook endpoint after too many requests from the same source", async () => {
    const baseUrl = await listen(BASE_ENV);
    let lastStatus = 200;
    for (let i = 0; i < 121; i++) {
      const res = await fetch(`${baseUrl}/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
