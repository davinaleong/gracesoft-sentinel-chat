import type { TelegramUpdate, NormalizedEvent } from "./types";

/**
 * Extracts the relevant message from a Telegram Update and normalises it.
 *
 * Returns `null` for:
 *   - updates with no usable message (edited_message, channel_post without text, etc.)
 *   - messages with unsupported types (video, sticker, location, …)
 */
export function normalizeWebhookEvent(
  update: TelegramUpdate
): NormalizedEvent | null {
  // Only handle fresh messages; ignore edits and channel posts
  const message = update.message;
  if (!message) return null;

  // Use chat.id as the stable identifier (works for private chats and groups)
  const from = `telegram:${message.chat.id}`;

  // ── Text ─────────────────────────────────────────────────────────────────
  if (message.text) {
    const text = message.text.trim();
    if (!text) return null;
    return { from, text };
  }

  // ── Photo (array of sizes — pick the largest, i.e. last) ─────────────────
  if (message.photo && message.photo.length > 0) {
    const largest = message.photo[message.photo.length - 1];
    return {
      from,
      rawMedia: {
        type: "image",
        mediaId: largest.file_id,
        // Telegram doesn't expose MIME type on PhotoSize; consumers should assume image/jpeg
        mimeType: "image/jpeg",
      },
    };
  }

  // ── Document ──────────────────────────────────────────────────────────────
  if (message.document) {
    return {
      from,
      rawMedia: {
        type: "document",
        mediaId: message.document.file_id,
        mimeType: message.document.mime_type,
      },
    };
  }

  // ── Audio / Voice ─────────────────────────────────────────────────────────
  if (message.audio) {
    return {
      from,
      rawMedia: {
        type: "audio",
        mediaId: message.audio.file_id,
        mimeType: message.audio.mime_type,
      },
    };
  }

  if (message.voice) {
    return {
      from,
      rawMedia: {
        type: "audio",
        mediaId: message.voice.file_id,
        mimeType: message.voice.mime_type ?? "audio/ogg",
      },
    };
  }

  // Video, sticker, location, etc. — unsupported
  return null;
}
