import { describe, expect, it } from "vitest";
import type { ChannelId } from "./channel.js";
import { NormalizedMessageSchema, type NormalizedMessage, type NormalizedResponse } from "./message.js";

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

export interface ChannelAdapterContractFixture {
  adapter: ChannelAdapter;
  /** A realistic raw inbound payload in this channel's own wire format. */
  sampleInboundPayload: unknown;
  /** A realistic normalized response to render outbound. */
  sampleResponse: NormalizedResponse;
  /** Recipient id in this channel's own id space. */
  recipientId: string;
}

/**
 * Shared contract test suite for `ChannelAdapter` implementations. Every
 * channel package should call this from its own test file with its own
 * fixtures — fixture payloads are necessarily channel-specific, but the
 * invariants below must hold for all of them.
 */
export function runChannelAdapterContractTests(
  name: string,
  makeFixture: () => ChannelAdapterContractFixture | Promise<ChannelAdapterContractFixture>
): void {
  describe(`ChannelAdapter contract: ${name}`, () => {
    it("declares a non-empty channel id", async () => {
      const { adapter } = await makeFixture();
      expect(adapter.channel).toBeTruthy();
    });

    it("parseInbound produces a valid NormalizedMessage", async () => {
      const { adapter, sampleInboundPayload } = await makeFixture();
      const message = await adapter.parseInbound(sampleInboundPayload);
      const result = NormalizedMessageSchema.safeParse(message);
      expect(result.success, result.success ? undefined : JSON.stringify(result.error.issues)).toBe(true);
    });

    it("parseInbound tags the message with the adapter's own channel id", async () => {
      const { adapter, sampleInboundPayload } = await makeFixture();
      const message = await adapter.parseInbound(sampleInboundPayload);
      expect(message.channel).toBe(adapter.channel);
    });

    it("formatOutbound accepts a valid NormalizedResponse without throwing", async () => {
      const { adapter, sampleResponse, recipientId } = await makeFixture();
      const output = await adapter.formatOutbound(sampleResponse, { recipientId });
      expect(output).toBeDefined();
    });
  });
}
