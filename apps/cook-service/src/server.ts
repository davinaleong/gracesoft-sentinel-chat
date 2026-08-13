import express, { type Express } from "express";
import { TelegramApiClient, TelegramChannelAdapter, createTelegramWebhookRouter } from "@gracesoft-sentinel/channel-telegram";
import { WhatsAppApiClient, WhatsAppChannelAdapter, createWhatsAppWebhookRouter } from "@gracesoft-sentinel/channel-whatsapp";
import type { NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import type { CookServiceEnv } from "./env.js";

export interface BuildServerParams {
  env: CookServiceEnv;
  onMessage: (message: NormalizedMessage) => Promise<NormalizedResponse>;
  readinessCheck: () => Promise<boolean>;
}

/** Composes the deployable HTTP surface — see concierge-service's equivalent for the design rationale. */
export function buildServer(params: BuildServerParams): Express {
  const { env } = params;
  const app = express();

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/ready", async (_req, res) => {
    const ready = await params.readinessCheck().catch(() => false);
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not ready" });
  });

  if (env.WHATSAPP_ENABLED) {
    const apiClient = new WhatsAppApiClient({ accessToken: env.WHATSAPP_ACCESS_TOKEN!, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID! });
    const adapter = new WhatsAppChannelAdapter({ resolveMedia: (mediaId) => apiClient.downloadMediaAsDataUri(mediaId) });
    app.use(
      createWhatsAppWebhookRouter({
        verifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!,
        appSecret: env.WHATSAPP_APP_SECRET!,
        adapter,
        apiClient,
        onMessage: params.onMessage,
      })
    );
  }

  if (env.TELEGRAM_ENABLED) {
    const apiClient = new TelegramApiClient({ botToken: env.TELEGRAM_BOT_TOKEN! });
    const adapter = new TelegramChannelAdapter({ resolveMedia: (fileId, mimeType) => apiClient.downloadFileAsDataUri(fileId, mimeType) });
    app.use(
      createTelegramWebhookRouter({
        secretToken: env.TELEGRAM_WEBHOOK_SECRET!,
        adapter,
        apiClient,
        onMessage: params.onMessage,
      })
    );
  }

  return app;
}
