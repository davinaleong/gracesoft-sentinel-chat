import type { ChannelAdapter, MediaType, NormalizedMedia, NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import type { SmsOutboundMessage, TwilioInboundWebhookBody } from "./sms-types.js";

export interface SmsChannelAdapterConfig {
  /** Downloads an MMS media URL's bytes, inlined as a `data:` URI — see `twilio-api-client.ts` for why. */
  resolveMedia?: (mediaUrl: string, mimeType: string) => Promise<{ url: string; mimeType: string }>;
}

function mediaTypeFor(mimeType: string): MediaType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}

/**
 * `ChannelAdapter` for SMS/MMS via Twilio — the third implementation in
 * this monorepo, deliberately picked because SMS has genuinely less
 * capability than WhatsApp/Telegram (plain text only, no native
 * interactive UI), proving the abstraction holds at the low end too, not
 * just for feature-rich channels.
 */
export class SmsChannelAdapter implements ChannelAdapter {
  readonly channel = "sms";

  private readonly resolveMedia: (mediaUrl: string, mimeType: string) => Promise<{ url: string; mimeType: string }>;

  constructor(config: SmsChannelAdapterConfig = {}) {
    this.resolveMedia =
      config.resolveMedia ??
      (() => {
        throw new Error("SmsChannelAdapter: no `resolveMedia` configured — cannot handle an incoming MMS media message");
      });
  }

  async parseInbound(payload: unknown): Promise<NormalizedMessage> {
    const body = payload as TwilioInboundWebhookBody;
    if (!body?.MessageSid || !body.From) {
      throw new Error("SmsChannelAdapter.parseInbound: payload is missing MessageSid/From");
    }

    let media: NormalizedMedia[] | undefined;
    const numMedia = Number(body.NumMedia ?? "0");
    if (numMedia > 0 && body.MediaUrl0) {
      const mimeType = body.MediaContentType0 ?? "application/octet-stream";
      const resolved = await this.resolveMedia(body.MediaUrl0, mimeType);
      media = [{ type: mediaTypeFor(mimeType), url: resolved.url, mimeType: resolved.mimeType }];
    }

    return {
      id: body.MessageSid,
      channel: this.channel,
      senderId: body.From,
      // Twilio's inbound webhook carries no timestamp field at all.
      timestamp: new Date().toISOString(),
      text: body.Body,
      media,
      raw: payload,
    };
  }

  formatOutbound(response: NormalizedResponse, context: { recipientId: string }): SmsOutboundMessage {
    let text = response.text ?? "";

    // SMS has no native interactive UI — quick replies degrade to a numbered
    // list in plain text. A reply like "2" is then resolved by the agent's
    // own free-text ordinal fallback (e.g. agent-concierge's
    // resolveSlotSelection), which every agent already supports as a
    // secondary path behind quickReplyId — SMS just always takes that path.
    if (response.quickReplies && response.quickReplies.length > 0) {
      const options = response.quickReplies.map((qr, i) => `${i + 1}. ${qr.label}`).join("\n");
      text = text ? `${text}\n\n${options}` : options;
    }

    return { to: context.recipientId, body: text };
  }
}
