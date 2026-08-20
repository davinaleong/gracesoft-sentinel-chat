import { describe, expect, it } from "vitest";
import type { ChannelAdapter } from "./channel-adapter.js";
import { NormalizedMessageSchema, type NormalizedResponse } from "./message.js";

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
 *
 * Deliberately kept out of `channel-adapter.ts` (and out of the package's
 * main entry point): it imports `vitest`, and pulling that into anything
 * that merely needs the `ChannelAdapter` type would drag `vitest`'s
 * module-level side effects into production code — it crashes outside an
 * active test run. Import this only from `@gracesoft-sentinel/core/testing`.
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
