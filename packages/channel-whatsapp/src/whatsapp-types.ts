/** WhatsApp Cloud API webhook payload shapes — inbound only. */

export interface WhatsAppMediaField {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
}

export interface WhatsAppInteractiveButtonReply {
  type: "button_reply";
  button_reply: { id: string; title: string };
}

export interface WhatsAppInteractiveListReply {
  type: "list_reply";
  list_reply: { id: string; title: string; description?: string };
}

export type WhatsAppInteractive = WhatsAppInteractiveButtonReply | WhatsAppInteractiveListReply;

export interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: "text" | "image" | "document" | "audio" | "video" | "interactive" | string;
  text?: { body: string };
  image?: WhatsAppMediaField;
  document?: WhatsAppMediaField;
  audio?: WhatsAppMediaField;
  video?: WhatsAppMediaField;
  interactive?: WhatsAppInteractive;
}

export interface WhatsAppWebhookValue {
  messaging_product: "whatsapp";
  metadata?: { phone_number_id: string };
  messages?: WhatsAppMessage[];
  statuses?: unknown[];
}

export interface WhatsAppWebhookPayload {
  object?: string;
  entry?: { id: string; changes: { value: WhatsAppWebhookValue; field: string }[] }[];
}

/** WhatsApp Cloud API send-request shapes — outbound only. */

export interface WhatsAppTextSendRequest {
  messaging_product: "whatsapp";
  to: string;
  type: "text";
  text: { body: string };
}

export interface WhatsAppImageSendRequest {
  messaging_product: "whatsapp";
  to: string;
  type: "image";
  image: { link: string; caption?: string };
}

export interface WhatsAppInteractiveButtonsSendRequest {
  messaging_product: "whatsapp";
  to: string;
  type: "interactive";
  interactive: {
    type: "button";
    body: { text: string };
    action: { buttons: { type: "reply"; reply: { id: string; title: string } }[] };
  };
}

export interface WhatsAppInteractiveListSendRequest {
  messaging_product: "whatsapp";
  to: string;
  type: "interactive";
  interactive: {
    type: "list";
    body: { text: string };
    action: {
      button: string;
      sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
    };
  };
}

export type WhatsAppSendRequest =
  | WhatsAppTextSendRequest
  | WhatsAppImageSendRequest
  | WhatsAppInteractiveButtonsSendRequest
  | WhatsAppInteractiveListSendRequest;
