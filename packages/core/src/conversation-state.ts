import { z } from "zod";

/**
 * Channel-agnostic session shape backing the Redis-backed state store
 * (Milestone 8). `context` is intentionally an open bag — each agent owns
 * the shape of its own in-progress state (e.g. a booking-in-progress
 * scratchpad) without `core` needing to know about it.
 */
export const ConversationStateSchema = z.object({
  sessionId: z.string(),
  channel: z.string(),
  userId: z.string(),
  agent: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  context: z.record(z.string(), z.unknown()).default({}),
});
export type ConversationState = z.infer<typeof ConversationStateSchema>;
