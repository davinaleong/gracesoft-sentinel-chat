import express from "express";
import type { AppModule } from "@sentinel/gateway-core";
import { createGateway } from "@sentinel/gateway-core";
import { WhatsAppClient } from "@sentinel/whatsapp-client";
import { createWebhookRouter } from "./webhookRouter";
import { config } from "./config";

/**
 * Creates and configures the Express application.
 *
 * @param apps - Registered app modules (passed in from index.ts at startup).
 */
export function createApp(apps: AppModule<any>[]) {
  const gateway = createGateway(apps);
  const client = new WhatsAppClient({
    phoneNumberId: config.phoneNumberId,
    accessToken: config.accessToken,
  });

  const app = express();

  // Health check
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Webhook routes (raw body parsing is handled inside the router)
  app.use(
    "/webhook",
    createWebhookRouter(
      gateway,
      client,
      config.appSecret,
      config.webhookVerifyToken
    )
  );

  return app;
}
