import express, { Router, Request, Response } from "express";
import type { Gateway, GatewayInput } from "@sentinel/gateway-core";
import { createLogger } from "@sentinel/gateway-core";
import {
  WhatsAppClient,
  verifySignature,
  normalizeWebhookEvent,
} from "@sentinel/whatsapp-client";
import type { WhatsAppWebhookPayload } from "@sentinel/whatsapp-client";

const log = createLogger("gateway-whatsapp");

export function createWebhookRouter(
  gateway: Gateway,
  client: WhatsAppClient,
  appSecret: string,
  webhookVerifyToken: string
): Router {
  const router = Router();

  // ── GET /webhook — Meta challenge–response verification ────────────────
  router.get("/webhook", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const challenge = req.query["hub.challenge"];
    const verifyToken = req.query["hub.verify_token"];

    if (mode === "subscribe" && verifyToken === webhookVerifyToken) {
      log.info("Webhook verified by Meta");
      res.status(200).send(challenge);
    } else {
      log.warn("Webhook verification failed", { mode, verifyToken });
      res.sendStatus(403);
    }
  });

  // ── POST /webhook — inbound messages ─────────────────────────────────
  router.post(
    "/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const signature = req.headers["x-hub-signature-256"] as string | undefined;

      if (!signature || !verifySignature(req.body as Buffer, signature, appSecret)) {
        log.warn("Rejected request: invalid signature");
        res.sendStatus(403);
        return;
      }

      // Acknowledge immediately — WhatsApp requires a 200 within 5 seconds
      res.sendStatus(200);

      try {
        const payload = JSON.parse(
          (req.body as Buffer).toString("utf8")
        ) as WhatsAppWebhookPayload;

        const event = normalizeWebhookEvent(payload);
        if (!event) {
          log.info("Ignoring non-message webhook event");
          return;
        }

        log.info("Inbound message", {
          from: event.from,
          type: event.rawMedia ? event.rawMedia.type : "text",
        });

        // Build GatewayInput, resolving media ID to URL if needed
        const gatewayInput: GatewayInput = {
          from: event.from,
          text: event.text,
        };

        if (event.rawMedia) {
          const resolved = await client.getMediaUrl(event.rawMedia.mediaId);
          gatewayInput.media = {
            type: event.rawMedia.type,
            url: resolved.url,
            mimeType: resolved.mimeType,
          };
        }

        const output = await gateway.process(gatewayInput);

        // Send reply messages — strip the "whatsapp:" prefix for the To field
        const to = event.from.replace("whatsapp:", "");
        const replies = Array.isArray(output.reply) ? output.reply : [output.reply];

        for (const reply of replies) {
          await client.sendText(to, reply);
        }

        log.info("Replied", { to, replyCount: replies.length });
      } catch (err) {
        log.error("Error processing webhook", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  return router;
}
