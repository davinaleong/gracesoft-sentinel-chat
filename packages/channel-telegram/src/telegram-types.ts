/** Telegram Bot API webhook update shapes — inbound only. */

export interface TelegramChat {
  id: number;
}

export interface TelegramPhotoSize {
  file_id: string;
  width: number;
  height: number;
}

export interface TelegramDocument {
  file_id: string;
  mime_type?: string;
}

export interface TelegramAudio {
  file_id: string;
  mime_type?: string;
}

export interface TelegramVoice {
  file_id: string;
  mime_type?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  audio?: TelegramAudio;
  voice?: TelegramVoice;
}

export interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: TelegramMessage;
  from: { id: number };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

/** Telegram Bot API send-request shapes — outbound only. */

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface TelegramSendMessageRequest {
  chat_id: number | string;
  text: string;
  reply_markup?: { inline_keyboard: TelegramInlineKeyboardButton[][] };
}

export interface TelegramSendPhotoRequest {
  chat_id: number | string;
  photo: string;
  caption?: string;
}

export type TelegramSendRequest =
  | { method: "sendMessage"; body: TelegramSendMessageRequest }
  | { method: "sendPhoto"; body: TelegramSendPhotoRequest };
