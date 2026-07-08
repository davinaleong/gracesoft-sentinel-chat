// Telegram Bot API types (subset needed for webhook normalisation)

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  audio?: TelegramAudio;
  voice?: TelegramVoice;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
}

// ── Telegram API response wrapper ─────────────────────────────────────────

export interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

// ── Normalised output shapes (same as whatsapp-client) ────────────────────

/** Media reference as returned by the Telegram webhook (file_id must be resolved) */
export interface RawMediaRef {
  type: "image" | "document" | "audio";
  mediaId: string;
  mimeType?: string;
}

/**
 * Normalised inbound event from a Telegram webhook update.
 * `rawMedia.mediaId` must be resolved to a URL via `TelegramClient.getFileUrl()`
 * before being passed to gateway-core.
 */
export interface NormalizedEvent {
  /** Channel-qualified user ID: "telegram:<chat_id>" */
  from: string;
  text?: string;
  rawMedia?: RawMediaRef;
}

/** Resolved file info returned by `TelegramClient.getFileUrl()` */
export interface ResolvedMedia {
  url: string;
  mimeType?: string;
}
