import type { ChannelId } from "./channel.js";
import type { NormalizedMessage, NormalizedResponse } from "./message.js";

/**
 * A `ChannelAdapter` is the only place channel-specific payload shapes are
 * allowed to exist. Everything on either side of it is `core` types.
 */
export interface ChannelAdapter {
  readonly channel: ChannelId;
  parseInbound(payload: unknown): Promise<NormalizedMessage> | NormalizedMessage;
  formatOutbound(
    response: NormalizedResponse,
    context: { recipientId: string }
  ): Promise<unknown> | unknown;
}
