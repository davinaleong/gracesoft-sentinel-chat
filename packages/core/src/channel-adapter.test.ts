import type { ChannelAdapter } from "./channel-adapter.js";
import { runChannelAdapterContractTests } from "./channel-adapter.js";

/**
 * Trivial in-memory adapter, used only to prove the contract suite itself
 * is correct. Real channels are wired up in Milestones 6/7.
 */
class FakeAdapter implements ChannelAdapter {
  readonly channel = "fake";

  parseInbound(payload: unknown) {
    const p = payload as { id: string; from: string; body: string };
    return {
      id: p.id,
      channel: this.channel,
      senderId: p.from,
      timestamp: new Date().toISOString(),
      text: p.body,
      raw: p,
    };
  }

  formatOutbound(response: { text?: string }, context: { recipientId: string }) {
    return { to: context.recipientId, body: response.text ?? "" };
  }
}

runChannelAdapterContractTests("FakeAdapter (self-test)", () => ({
  adapter: new FakeAdapter(),
  sampleInboundPayload: { id: "1", from: "user-1", body: "hi" },
  sampleResponse: { text: "hello back" },
  recipientId: "user-1",
}));
