import type {
  WhatsAppWebhookPayload,
  NormalizedEvent,
} from "./types";

const SUPPORTED_MEDIA_TYPES = ["image", "document", "audio"] as const;
type SupportedMedia = (typeof SUPPORTED_MEDIA_TYPES)[number];

function isSupportedMedia(type: string): type is SupportedMedia {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(type);
}

/**
 * Extracts the first user-sent message from a WhatsApp webhook payload and
 * normalises it into a predictable shape.
 *
 * Returns `null` for:
 *   - status updates (delivered / read receipts)
 *   - unsupported message types (video, sticker, location, …)
 *   - malformed / empty payloads
 */
export function normalizeWebhookEvent(
  payload: WhatsAppWebhookPayload
): NormalizedEvent | null {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  if (!value) return null;

  const message = value.messages?.[0];
  if (!message) return null; // likely a status update

  const from = `whatsapp:${message.from}`;

  switch (message.type) {
    case "text": {
      const text = message.text?.body?.trim();
      if (!text) return null;
      return { from, text };
    }

    case "image":
    case "document":
    case "audio": {
      if (!isSupportedMedia(message.type)) return null;
      const mediaField =
        message.type === "image"
          ? message.image
          : message.type === "document"
          ? message.document
          : message.audio;

      if (!mediaField?.id) return null;

      return {
        from,
        rawMedia: {
          type: message.type,
          mediaId: mediaField.id,
          mimeType: mediaField.mime_type,
        },
      };
    }

    default:
      // video, sticker, location, etc. — unsupported for now
      return null;
  }
}
