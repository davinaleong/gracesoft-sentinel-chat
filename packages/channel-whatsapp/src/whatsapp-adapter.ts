import type { ChannelAdapter, MediaType, NormalizedMedia, NormalizedMessage, NormalizedResponse, QuickReply } from "@gracesoft-sentinel/core";
import type {
  WhatsAppInteractiveButtonsSendRequest,
  WhatsAppInteractiveListSendRequest,
  WhatsAppMediaField,
  WhatsAppMessage,
  WhatsAppSendRequest,
  WhatsAppWebhookPayload,
} from "./whatsapp-types.js";

const MEDIA_MESSAGE_TYPES: MediaType[] = ["image", "document", "audio", "video"];
const BUTTON_TITLE_MAX_LENGTH = 20;
const LIST_ROW_TITLE_MAX_LENGTH = 24;
const MAX_INTERACTIVE_BUTTONS = 3;

export interface WhatsAppChannelAdapterConfig {
  /** Downloads a media id's bytes, inlined as a `data:` URI — WhatsApp media links require an
   * auth header and expire in minutes, so a bare URL can't be handed to a downstream AIProvider. */
  resolveMedia?: (mediaId: string, mimeType: string) => Promise<{ url: string; mimeType: string }>;
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

/** Extracts the first inbound message from a webhook payload, or `undefined` for a status-update ping. */
export function extractInboundMessage(payload: unknown): WhatsAppMessage | undefined {
  const value = (payload as WhatsAppWebhookPayload)?.entry?.[0]?.changes?.[0]?.value;
  return value?.messages?.[0];
}

/**
 * `ChannelAdapter` for the WhatsApp Cloud API — the only place in
 * `channel-whatsapp` that knows about WhatsApp's own payload shapes.
 */
export class WhatsAppChannelAdapter implements ChannelAdapter {
  readonly channel = "whatsapp";

  private readonly resolveMedia: (mediaId: string, mimeType: string) => Promise<{ url: string; mimeType: string }>;

  constructor(config: WhatsAppChannelAdapterConfig = {}) {
    this.resolveMedia =
      config.resolveMedia ??
      (() => {
        throw new Error("WhatsAppChannelAdapter: no `resolveMedia` configured — cannot handle an incoming media message");
      });
  }

  async parseInbound(payload: unknown): Promise<NormalizedMessage> {
    const message = extractInboundMessage(payload);
    if (!message) {
      throw new Error("WhatsAppChannelAdapter.parseInbound: payload contains no message (likely a status update)");
    }
    const businessChannelId = (payload as WhatsAppWebhookPayload)?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    let text: string | undefined;
    let quickReplyId: string | undefined;
    let media: NormalizedMedia[] | undefined;

    if (message.type === "text") {
      text = message.text?.body;
    } else if (message.type === "interactive" && message.interactive) {
      if (message.interactive.type === "button_reply") {
        quickReplyId = message.interactive.button_reply.id;
        text = message.interactive.button_reply.title;
      } else if (message.interactive.type === "list_reply") {
        quickReplyId = message.interactive.list_reply.id;
        text = message.interactive.list_reply.title;
      }
    } else if (MEDIA_MESSAGE_TYPES.includes(message.type as MediaType)) {
      const field = (message as unknown as Record<string, WhatsAppMediaField | undefined>)[message.type];
      if (field) {
        const resolved = await this.resolveMedia(field.id, field.mime_type);
        media = [{ type: message.type as MediaType, url: resolved.url, mimeType: resolved.mimeType, caption: field.caption }];
      }
    }

    return {
      id: message.id,
      channel: this.channel,
      senderId: message.from,
      timestamp: new Date(Number(message.timestamp) * 1000).toISOString(),
      text,
      media,
      quickReplyId,
      businessChannelId,
      raw: payload,
    };
  }

  formatOutbound(response: NormalizedResponse, context: { recipientId: string }): WhatsAppSendRequest {
    const to = context.recipientId;

    if (response.quickReplies && response.quickReplies.length > 0) {
      return response.quickReplies.length <= MAX_INTERACTIVE_BUTTONS
        ? buildButtonsMessage(to, response.text ?? "", response.quickReplies)
        : buildListMessage(to, response.text ?? "", response.quickReplies);
    }

    if (response.media?.[0]?.url) {
      return { messaging_product: "whatsapp", to, type: "image", image: { link: response.media[0].url, caption: response.text } };
    }

    return { messaging_product: "whatsapp", to, type: "text", text: { body: response.text ?? "" } };
  }
}

function buildButtonsMessage(to: string, bodyText: string, quickReplies: QuickReply[]): WhatsAppInteractiveButtonsSendRequest {
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: quickReplies.map((qr) => ({
          type: "reply",
          reply: { id: qr.id, title: truncate(qr.label, BUTTON_TITLE_MAX_LENGTH) },
        })),
      },
    },
  };
}

function buildListMessage(to: string, bodyText: string, quickReplies: QuickReply[]): WhatsAppInteractiveListSendRequest {
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: {
        button: "Choose an option",
        sections: [{ rows: quickReplies.map((qr) => ({ id: qr.id, title: truncate(qr.label, LIST_ROW_TITLE_MAX_LENGTH) })) }],
      },
    },
  };
}
