import express, { type Request, type Response, type Router } from "express";
import type { NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import { verifyWhatsAppSignature } from "./signature.js";
import { handleVerificationRequest } from "./webhook-verification.js";
import { extractInboundMessage, type WhatsAppChannelAdapter } from "./whatsapp-adapter.js";
import type { WhatsAppApiClient } from "./whatsapp-api-client.js";

export interface WhatsAppWebhookRouterConfig {
  verifyToken: string;
  appSecret: string;
  adapter: WhatsAppChannelAdapter;
  apiClient: WhatsAppApiClient;
  /** Injected by whoever composes this router with an agent — keeps this package agent-agnostic. */
  onMessage: (message: NormalizedMessage) => Promise<NormalizedResponse>;
  onError?: (error: unknown) => void;
}

/**
 * Express router for the WhatsApp Cloud API webhook — GET handshake, POST
 * signature verification, and dispatch through `onMessage`. Deliberately
 * takes `onMessage` as a callback rather than importing `agent-concierge`/
 * `agent-cook` directly: composing an agent with this channel is a
 * service-wiring concern (Milestone 8), not something this package owns.
 */
export function createWhatsAppWebhookRouter(config: WhatsAppWebhookRouterConfig): Router {
  const router = express.Router();
  const onError = config.onError ?? ((err: unknown) => console.error("[channel-whatsapp] webhook processing failed:", err));

  router.get("/webhook", (req: Request, res: Response) => {
    const result = handleVerificationRequest(req.query as Record<string, string | undefined>, config.verifyToken);
    res.status(result.status).send(result.body ?? "");
  });

  router.post("/webhook", express.raw({ type: "application/json" }), (req: Request, res: Response) => {
    const rawBody = req.body as Buffer;
    const signature = req.header("x-hub-signature-256");
    if (!verifyWhatsAppSignature(rawBody, signature, config.appSecret)) {
      res.sendStatus(403);
      return;
    }

    // Ack immediately — Meta expects a fast response within a few seconds
    // and retries the delivery otherwise; the rest happens after responding.
    res.sendStatus(200);

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf-8"));
    } catch (err) {
      onError(err);
      return;
    }

    if (!extractInboundMessage(payload)) return; // status update, nothing to do

    void (async () => {
      try {
        const normalized = await config.adapter.parseInbound(payload);
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
