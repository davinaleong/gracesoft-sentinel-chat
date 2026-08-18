import express, { type Request, type Response, type Router } from "express";
import type { NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import { verifyTwilioSignature } from "./signature.js";
import type { SmsChannelAdapter } from "./sms-adapter.js";
import type { TwilioApiClient } from "./twilio-api-client.js";
import type { TwilioInboundWebhookBody } from "./sms-types.js";

export interface SmsWebhookRouterConfig {
  authToken: string;
  /**
   * The exact externally-visible URL Twilio is configured to POST to
   * (including protocol/host/path) — Twilio's signature covers this, and
   * reconstructing it from the request behind a proxy is unreliable, so
   * it's supplied explicitly rather than inferred.
   */
  webhookUrl: string;
  adapter: SmsChannelAdapter;
  apiClient: TwilioApiClient;
  /** Injected by whoever composes this router with an agent — keeps this package agent-agnostic. */
  onMessage: (message: NormalizedMessage) => Promise<NormalizedResponse>;
  onError?: (error: unknown) => void;
}

/**
 * Express router for the Twilio SMS/MMS webhook. Twilio posts
 * `application/x-www-form-urlencoded`, not JSON (unlike WhatsApp/Telegram) —
 * `express.urlencoded()` parses that into `req.body` directly, no raw-body
 * gymnastics needed since Twilio's signature is computed over the parsed
 * key/value pairs, not the raw bytes.
 */
export function createSmsWebhookRouter(config: SmsWebhookRouterConfig): Router {
  const router = express.Router();
  const onError = config.onError ?? ((err: unknown) => console.error("[channel-sms] webhook processing failed:", err));

  router.post("/webhook", express.urlencoded({ extended: false }), (req: Request, res: Response) => {
    const body = req.body as TwilioInboundWebhookBody;
    const signature = req.header("x-twilio-signature");

    if (!verifyTwilioSignature(config.webhookUrl, body, signature, config.authToken)) {
      res.sendStatus(403);
      return;
    }

    // Ack immediately — Twilio retries if the webhook doesn't respond promptly.
    res.status(200).type("text/xml").send("<Response></Response>");

    void (async () => {
      try {
        const normalized = await config.adapter.parseInbound(body);
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
