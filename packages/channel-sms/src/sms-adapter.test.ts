import { describe, expect, it } from "vitest";
import { runChannelAdapterContractTests } from "@gracesoft-sentinel/core/testing";
import { SmsChannelAdapter } from "./sms-adapter.js";
import type { TwilioInboundWebhookBody } from "./sms-types.js";

function textPayload(): TwilioInboundWebhookBody {
  return { MessageSid: "SM123", From: "+6591234567", To: "+18885550000", Body: "Hi there" };
}

runChannelAdapterContractTests("SmsChannelAdapter", () => ({
  adapter: new SmsChannelAdapter(),
  sampleInboundPayload: textPayload(),
  sampleResponse: { text: "hello back" },
  recipientId: "+6591234567",
}));

describe("SmsChannelAdapter.parseInbound — text", () => {
  it("extracts sender and text", async () => {
    const adapter = new SmsChannelAdapter();
    const message = await adapter.parseInbound(textPayload());
    expect(message.senderId).toBe("+6591234567");
    expect(message.text).toBe("Hi there");
    expect(message.channel).toBe("sms");
    expect(message.businessChannelId).toBe("+18885550000");
  });

  it("throws a clear error when the payload is missing MessageSid/From", async () => {
    const adapter = new SmsChannelAdapter();
    await expect(adapter.parseInbound({ Body: "hi" })).rejects.toThrow(/missing MessageSid\/From/i);
  });
});

describe("SmsChannelAdapter.parseInbound — MMS media", () => {
  it("resolves an image attachment via the injected resolveMedia callback", async () => {
    const adapter = new SmsChannelAdapter({
      resolveMedia: async (_url, mimeType) => ({ url: `data:${mimeType};base64,ZmFrZQ==`, mimeType }),
    });
    const payload: TwilioInboundWebhookBody = {
      MessageSid: "SM124",
      From: "+6591234567",
      To: "+18885550000",
      NumMedia: "1",
      MediaUrl0: "https://api.twilio.com/media/ME123",
      MediaContentType0: "image/jpeg",
    };
    const message = await adapter.parseInbound(payload);
    expect(message.media).toHaveLength(1);
    expect(message.media![0]!.type).toBe("image");
    expect(message.media![0]!.url).toBe("data:image/jpeg;base64,ZmFrZQ==");
  });

  it("throws a clear error for MMS media when no resolveMedia is configured", async () => {
    const adapter = new SmsChannelAdapter();
    const payload: TwilioInboundWebhookBody = {
      MessageSid: "SM124",
      From: "+6591234567",
      To: "+18885550000",
      NumMedia: "1",
      MediaUrl0: "https://api.twilio.com/media/ME123",
      MediaContentType0: "image/jpeg",
    };
    await expect(adapter.parseInbound(payload)).rejects.toThrow(/no `resolveMedia` configured/i);
  });

  it("does not attach media when NumMedia is 0", async () => {
    const adapter = new SmsChannelAdapter();
    const message = await adapter.parseInbound(textPayload());
    expect(message.media).toBeUndefined();
  });
});

describe("SmsChannelAdapter.formatOutbound", () => {
  const adapter = new SmsChannelAdapter();

  it("formats a plain text response", () => {
    const output = adapter.formatOutbound({ text: "Hello!" }, { recipientId: "+6591234567" });
    expect(output).toEqual({ to: "+6591234567", body: "Hello!" });
  });

  it("degrades quick replies to a numbered plain-text list, since SMS has no interactive UI", () => {
    const output = adapter.formatOutbound(
      {
        text: "Pick a slot:",
        quickReplies: [
          { id: "slot-1", label: "Mon, 4 May, 9:00am" },
          { id: "slot-2", label: "Mon, 4 May, 10:00am" },
        ],
      },
      { recipientId: "+6591234567" }
    );
    expect(output.body).toBe("Pick a slot:\n\n1. Mon, 4 May, 9:00am\n2. Mon, 4 May, 10:00am");
  });

  it("omits the leading blank line when there's no text alongside the quick replies", () => {
    const output = adapter.formatOutbound(
      { quickReplies: [{ id: "slot-1", label: "Option A" }] },
      { recipientId: "+6591234567" }
    );
    expect(output.body).toBe("1. Option A");
  });
});
