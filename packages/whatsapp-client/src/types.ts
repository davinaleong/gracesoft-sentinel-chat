// WhatsApp Cloud API payload types (subset needed for webhook normalisation)

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: WhatsAppValue;
  field: string;
}

export interface WhatsAppValue {
  messaging_product: string;
  metadata: WhatsAppMetadata;
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

export interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

export type WhatsAppMessageType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "sticker"
  | "location"
  | "contacts"
  | "interactive"
  | "button"
  | "order"
  | "system"
  | "unknown";

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: WhatsAppMessageType;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256?: string; caption?: string };
  document?: {
    id: string;
    mime_type: string;
    filename?: string;
    caption?: string;
  };
  audio?: { id: string; mime_type: string; voice?: boolean };
}

export interface WhatsAppStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
}

// ── Send request shapes ────────────────────────────────────────────────────

export interface WhatsAppSendTextRequest {
  messaging_product: "whatsapp";
  to: string;
  type: "text";
  text: { body: string };
}

export interface WhatsAppSendImageRequest {
  messaging_product: "whatsapp";
  to: string;
  type: "image";
  image: { link: string; caption?: string };
}

export type WhatsAppSendRequest =
  | WhatsAppSendTextRequest
  | WhatsAppSendImageRequest;

// ── Normalised output shapes ───────────────────────────────────────────────

/** Media reference as returned by the WhatsApp webhook (mediaId must be resolved) */
export interface RawMediaRef {
  type: "image" | "document" | "audio";
  mediaId: string;
  mimeType?: string;
}

/**
 * Normalised inbound event from a WhatsApp webhook message.
 * `rawMedia.mediaId` must be resolved to a URL via `WhatsAppClient.getMediaUrl()`
 * before being passed to gateway-core.
 */
export interface NormalizedEvent {
  /** Channel-qualified user ID: "whatsapp:<wa_id>" */
  from: string;
  text?: string;
  rawMedia?: RawMediaRef;
}

/** Resolved media info returned by `WhatsAppClient.getMediaUrl()` */
export interface ResolvedMedia {
  url: string;
  mimeType: string;
}
