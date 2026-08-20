import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";
import { TelegramApiClient, TelegramChannelAdapter, createTelegramWebhookRouter } from "@gracesoft-sentinel/channel-telegram";
import { WhatsAppApiClient, WhatsAppChannelAdapter, createWhatsAppWebhookRouter } from "@gracesoft-sentinel/channel-whatsapp";
import type { NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import type { Logger } from "@gracesoft-sentinel/logging";
import type { CookServiceEnv } from "./env.js";

export interface BuildServerParams {
  env: CookServiceEnv;
  onMessage: (message: NormalizedMessage) => Promise<NormalizedResponse>;
  readinessCheck: () => Promise<boolean>;
  appLogger: Logger;
}

/** See concierge-service's equivalent for the rationale (IP-based floor against abuse, not per-chatter fairness). */
function webhookRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/** Composes the deployable HTTP surface — see concierge-service's equivalent for the design rationale. */
export function buildServer(params: BuildServerParams): Express {
  const { env, appLogger } = params;
  const app = express();
  // Exactly one hop: the reverse proxy/tunnel this service always sits
  // behind (ngrok locally, a load balancer in production) — not `true`,
  // which would trust the entire client-supplied X-Forwarded-For chain
  // and let a client spoof its own rate-limit identity.
  app.set("trust proxy", 1);

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
      webhookRateLimiter(),
      createWhatsAppWebhookRouter({
        verifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!,
        appSecret: env.WHATSAPP_APP_SECRET!,
        adapter,
        apiClient,
        onMessage: params.onMessage,
        onError: (err) => appLogger.error({ err }, "WhatsApp webhook processing failed"),
      })
    );
  }

  if (env.TELEGRAM_ENABLED) {
    const apiClient = new TelegramApiClient({ botToken: env.TELEGRAM_BOT_TOKEN! });
    const adapter = new TelegramChannelAdapter({ resolveMedia: (fileId, mimeType) => apiClient.downloadFileAsDataUri(fileId, mimeType) });
    app.use(
      webhookRateLimiter(),
      createTelegramWebhookRouter({
        secretToken: env.TELEGRAM_WEBHOOK_SECRET!,
        adapter,
        apiClient,
        onMessage: params.onMessage,
        onError: (err) => appLogger.error({ err }, "Telegram webhook processing failed"),
      })
    );
  }

  return app;
}
