import { z } from "zod";

export const MediaTypeSchema = z.enum(["image", "audio", "video", "document"]);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const NormalizedMediaSchema = z.object({
  type: MediaTypeSchema,
  url: z.string().optional(),
  mimeType: z.string().optional(),
  caption: z.string().optional(),
});
export type NormalizedMedia = z.infer<typeof NormalizedMediaSchema>;

export const QuickReplySchema = z.object({
  id: z.string(),
  label: z.string(),
});
export type QuickReply = z.infer<typeof QuickReplySchema>;

/**
 * A channel-agnostic shape for any inbound message, produced by a
 * `ChannelAdapter.parseInbound()`. Agents consume only this shape — never
 * the underlying WhatsApp/Telegram payload directly.
 */
export const NormalizedMessageSchema = z.object({
  id: z.string(),
  channel: z.string(),
  senderId: z.string(),
  /** ISO 8601 timestamp. */
  timestamp: z.string(),
  text: z.string().optional(),
  media: z.array(NormalizedMediaSchema).optional(),
  /** id of a quick-reply/button/list item the sender tapped, if any. */
  quickReplyId: z.string().optional(),
  /**
   * Which of the *business's own* channel identities received this message
   * (e.g. a WhatsApp `phone_number_id`, a Twilio `To` number) — not to be
   * confused with `ChannelAdapter.formatOutbound`'s `recipientId`, which is
   * the opposite direction (the customer's id to reply *to*). Lets a single
   * deployment resolve which tenant/`BusinessConfig` a message belongs to.
   * Undefined where the channel has no such concept (e.g. a Telegram bot's
   * identity is implicit in its webhook URL, not the payload).
   */
  businessChannelId: z.string().optional(),
  /** Untouched source payload, for channel-specific edge cases and debugging. */
  raw: z.unknown(),
});
export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>;

/**
 * A channel-agnostic shape for any outbound reply, produced by agent logic
 * and rendered by `ChannelAdapter.formatOutbound()` into a channel-specific
 * payload.
 */
export const NormalizedResponseSchema = z.object({
  text: z.string().optional(),
  quickReplies: z.array(QuickReplySchema).optional(),
  media: z.array(NormalizedMediaSchema).optional(),
  /** Channel-specific extensions that don't warrant a core field yet. */
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type NormalizedResponse = z.infer<typeof NormalizedResponseSchema>;
