import express, { type Request, type Response, type Router } from "express";
import type { NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import { verifyTelegramSecretToken } from "./secret-token.js";
import type { TelegramChannelAdapter } from "./telegram-adapter.js";
import type { TelegramApiClient } from "./telegram-api-client.js";
import type { TelegramUpdate } from "./telegram-types.js";

export interface TelegramWebhookRouterConfig {
  secretToken: string;
  adapter: TelegramChannelAdapter;
  apiClient: TelegramApiClient;
  /** Injected by whoever composes this router with an agent — keeps this package agent-agnostic. */
  onMessage: (message: NormalizedMessage) => Promise<NormalizedResponse>;
  onError?: (error: unknown) => void;
}

function hasContent(update: TelegramUpdate): boolean {
  return Boolean(update.message ?? update.callback_query);
}

/**
 * Express router for the Telegram Bot API webhook. Unlike WhatsApp, there's
 * no GET handshake — webhook registration happens via a one-time
 * `setWebhook` API call (see `TelegramApiClient.setWebhook`) — so this is
 * POST-only, gated by the `X-Telegram-Bot-Api-Secret-Token` header. Takes
 * `onMessage` as a callback for the same reason as `channel-whatsapp`'s
 * router: composing an agent with this channel is Milestone 8's concern.
 */
export function createTelegramWebhookRouter(config: TelegramWebhookRouterConfig): Router {
  const router = express.Router();
  const onError = config.onError ?? ((err: unknown) => console.error("[channel-telegram] webhook processing failed:", err));

  router.post("/webhook", express.json(), (req: Request, res: Response) => {
    const secret = req.header("x-telegram-bot-api-secret-token");
    if (!verifyTelegramSecretToken(secret, config.secretToken)) {
      res.sendStatus(403);
      return;
    }

    // Ack immediately — Telegram retries if the webhook doesn't respond promptly.
    res.sendStatus(200);

    const update = req.body as TelegramUpdate;
    if (!hasContent(update)) return; // nothing actionable in this update

    void (async () => {
      try {
        const normalized = await config.adapter.parseInbound(update);
        const response = await config.onMessage(normalized);
        const outbound = await config.adapter.formatOutbound(response, { recipientId: normalized.senderId });
        await config.apiClient.sendMessage(outbound);
      } catch (err) {
        onError(err);
      }
    })();
  });

  return router;
}
