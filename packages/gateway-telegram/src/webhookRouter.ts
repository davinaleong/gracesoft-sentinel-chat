import express, { Router, Request, Response } from "express";
import type { Gateway, GatewayInput } from "@sentinel/gateway-core";
import { createLogger } from "@sentinel/gateway-core";
import {
  TelegramClient,
  verifySecretToken,
  normalizeWebhookEvent,
} from "@sentinel/telegram-client";
import type { TelegramUpdate } from "@sentinel/telegram-client";

const log = createLogger("gateway-telegram");

export function createWebhookRouter(
  gateway: Gateway,
  client: TelegramClient,
  webhookSecret: string
): Router {
  const router = Router();

  router.post(
    "/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const receivedSecret = req.headers["x-telegram-bot-api-secret-token"] as
        | string
        | undefined;

      if (!verifySecretToken(receivedSecret, webhookSecret)) {
        log.warn("Rejected request: invalid secret token");
        res.sendStatus(403);
        return;
      }

      // Acknowledge immediately
      res.sendStatus(200);

      try {
        const update = JSON.parse(
          (req.body as Buffer).toString("utf8")
        ) as TelegramUpdate;

        const event = normalizeWebhookEvent(update);
        if (!event) {
          log.info("Ignoring unsupported update type", { updateId: update.update_id });
          return;
        }

        log.info("Inbound message", {
          from: event.from,
          type: event.rawMedia ? event.rawMedia.type : "text",
        });

        // Build GatewayInput, resolving file ID to URL if needed
        const gatewayInput: GatewayInput = {
          from: event.from,
          text: event.text,
        };

        if (event.rawMedia) {
          const resolved = await client.getFileUrl(event.rawMedia.mediaId);
          gatewayInput.media = {
            type: event.rawMedia.type,
            url: resolved.url,
            mimeType: event.rawMedia.mimeType,
          };
        }

        const output = await gateway.process(gatewayInput);

        // Extract numeric chat ID from the channel-qualified "telegram:<id>"
        const chatId = event.from.replace("telegram:", "");
        const replies = Array.isArray(output.reply) ? output.reply : [output.reply];

        for (const reply of replies) {
          await client.sendText(chatId, reply);
        }

        log.info("Replied", { chatId, replyCount: replies.length });
      } catch (err) {
        log.error("Error processing webhook", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  return router;
}
