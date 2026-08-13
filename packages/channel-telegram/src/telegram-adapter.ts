import type { ChannelAdapter, NormalizedMedia, NormalizedMessage, NormalizedResponse, QuickReply } from "@gracesoft-sentinel/core";
import type { TelegramSendRequest, TelegramUpdate } from "./telegram-types.js";

const INLINE_BUTTON_TEXT_MAX_LENGTH = 64;

export interface TelegramChannelAdapterConfig {
  /** Downloads a Telegram file id's bytes, inlined as a `data:` URI — see `telegram-api-client.ts` for why. */
  resolveMedia?: (fileId: string, mimeType: string) => Promise<{ url: string; mimeType: string }>;
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

/** Extracts the chat id an update pertains to, regardless of whether it's a message or a callback query. */
function chatIdOf(update: TelegramUpdate): number | undefined {
  return update.message?.chat.id ?? update.callback_query?.message?.chat.id;
}

/**
 * `ChannelAdapter` for the Telegram Bot API — the only place in
 * `channel-telegram` that knows about Telegram's own payload shapes. The
 * second `ChannelAdapter` implementation in this monorepo: if this and
 * `WhatsAppChannelAdapter` both satisfy the same interface and pass the
 * same contract suite, the "platform-agnostic" abstraction is proven, not
 * just aspirational.
 */
export class TelegramChannelAdapter implements ChannelAdapter {
  readonly channel = "telegram";

  private readonly resolveMedia: (fileId: string, mimeType: string) => Promise<{ url: string; mimeType: string }>;

  constructor(config: TelegramChannelAdapterConfig = {}) {
    this.resolveMedia =
      config.resolveMedia ??
      (() => {
        throw new Error("TelegramChannelAdapter: no `resolveMedia` configured — cannot handle an incoming media message");
      });
  }

  async parseInbound(payload: unknown): Promise<NormalizedMessage> {
    const update = payload as TelegramUpdate;
    const chatId = chatIdOf(update);
    if (chatId === undefined) {
      throw new Error("TelegramChannelAdapter.parseInbound: update contains no message or callback query");
    }

    if (update.callback_query) {
      return {
        id: update.callback_query.id,
        channel: this.channel,
        senderId: String(chatId),
        timestamp: new Date().toISOString(),
        text: update.callback_query.data,
        quickReplyId: update.callback_query.data,
        raw: payload,
      };
    }

    const message = update.message!;
    let media: NormalizedMedia[] | undefined;

    if (message.photo && message.photo.length > 0) {
      // Telegram sends the same photo at multiple resolutions; the last entry is the largest.
      const largest = message.photo[message.photo.length - 1]!;
      const resolved = await this.resolveMedia(largest.file_id, "image/jpeg");
      media = [{ type: "image", url: resolved.url, mimeType: resolved.mimeType }];
    } else if (message.document) {
      const resolved = await this.resolveMedia(message.document.file_id, message.document.mime_type ?? "application/octet-stream");
      media = [{ type: "document", url: resolved.url, mimeType: resolved.mimeType }];
    } else if (message.audio) {
      const resolved = await this.resolveMedia(message.audio.file_id, message.audio.mime_type ?? "audio/mpeg");
      media = [{ type: "audio", url: resolved.url, mimeType: resolved.mimeType }];
    } else if (message.voice) {
      const resolved = await this.resolveMedia(message.voice.file_id, message.voice.mime_type ?? "audio/ogg");
      media = [{ type: "audio", url: resolved.url, mimeType: resolved.mimeType }];
    }

    return {
      id: String(message.message_id),
      channel: this.channel,
      senderId: String(chatId),
      timestamp: new Date(message.date * 1000).toISOString(),
      text: message.text ?? message.caption,
      media,
      raw: payload,
    };
  }

  formatOutbound(response: NormalizedResponse, context: { recipientId: string }): TelegramSendRequest {
    const chatId = context.recipientId;

    if (response.quickReplies && response.quickReplies.length > 0) {
      return {
        method: "sendMessage",
        body: {
          chat_id: chatId,
          text: response.text ?? "",
          reply_markup: { inline_keyboard: buildInlineKeyboard(response.quickReplies) },
        },
      };
    }

    if (response.media?.[0]?.url) {
      return { method: "sendPhoto", body: { chat_id: chatId, photo: response.media[0].url, caption: response.text } };
    }

    return { method: "sendMessage", body: { chat_id: chatId, text: response.text ?? "" } };
  }
}

function buildInlineKeyboard(quickReplies: QuickReply[]): { text: string; callback_data: string }[][] {
  // One button per row — simplest layout, always legible regardless of label length.
  return quickReplies.map((qr) => [{ text: truncate(qr.label, INLINE_BUTTON_TEXT_MAX_LENGTH), callback_data: qr.id }]);
}
