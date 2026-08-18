/**
 * Twilio delivers inbound SMS/MMS webhooks as `application/x-www-form-urlencoded`
 * POST bodies (not JSON, unlike WhatsApp/Telegram) — Express's `urlencoded()`
 * middleware parses this into a plain string-keyed object matching this shape.
 */
export interface TwilioInboundWebhookBody {
  MessageSid: string;
  From: string;
  To: string;
  Body?: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  [key: string]: string | undefined;
}

/**
 * What `SmsChannelAdapter.formatOutbound` produces — no `From` number, since
 * unlike WhatsApp's `phoneNumberId`-in-the-URL model, Twilio's `From` is a
 * per-request body field the API client (which owns the business's Twilio
 * number) fills in, not something the adapter itself knows.
 */
export interface SmsOutboundMessage {
  to: string;
  body: string;
}
