import express from "express";
import type { AppModule } from "@sentinel/gateway-core";
import { createGateway } from "@sentinel/gateway-core";
import { TelegramClient } from "@sentinel/telegram-client";
import { createWebhookRouter } from "./webhookRouter";
import { config } from "./config";

/**
 * Creates and configures the Express application.
 *
 * @param apps - Registered app modules (passed in from index.ts at startup).
 */
export function createApp(apps: AppModule[]) {
  const gateway = createGateway(apps);
  const client = new TelegramClient({ botToken: config.botToken });

  const app = express();

  // Health check
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Webhook route (raw body parsing is handled inside the router)
  app.use("/", createWebhookRouter(gateway, client, config.webhookSecret));

  return app;
}
