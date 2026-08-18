import { describe, expect, it } from "vitest";
import { runChannelAdapterContractTests } from "@gracesoft-sentinel/core";
import { WhatsAppChannelAdapter } from "./whatsapp-adapter.js";
import type { WhatsAppWebhookPayload } from "./whatsapp-types.js";

function textPayload(): WhatsAppWebhookPayload {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "1234567890" },
              messages: [
                {
                  id: "wamid.1",
                  from: "6591234567",
                  timestamp: "1746000000",
                  type: "text",
                  text: { body: "Hi there" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

runChannelAdapterContractTests("WhatsAppChannelAdapter", () => ({
  adapter: new WhatsAppChannelAdapter(),
  sampleInboundPayload: textPayload(),
  sampleResponse: { text: "hello back" },
  recipientId: "6591234567",
}));

describe("WhatsAppChannelAdapter.parseInbound — text", () => {
  it("extracts sender, text, and a correctly converted timestamp", async () => {
    const adapter = new WhatsAppChannelAdapter();
    const message = await adapter.parseInbound(textPayload());
    expect(message.senderId).toBe("6591234567");
    expect(message.text).toBe("Hi there");
    expect(message.channel).toBe("whatsapp");
    expect(message.timestamp).toBe(new Date(1746000000 * 1000).toISOString());
    expect(message.businessChannelId).toBe("1234567890");
  });

  it("throws a clear error for a status-update payload with no message", async () => {
    const adapter = new WhatsAppChannelAdapter();
    const statusPayload: WhatsAppWebhookPayload = {
      entry: [{ id: "e1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", statuses: [{}] } }] }],
    };
    await expect(adapter.parseInbound(statusPayload)).rejects.toThrow(/no message/i);
  });
});

describe("WhatsAppChannelAdapter.parseInbound — interactive booking replies", () => {
  it("extracts the quickReplyId and title from a button reply (slot selection)", async () => {
    const adapter = new WhatsAppChannelAdapter();
    const payload: WhatsAppWebhookPayload = {
      entry: [
        {
          id: "e1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                messages: [
                  {
                    id: "wamid.2",
                    from: "6591234567",
                    timestamp: "1746000000",
                    type: "interactive",
                    interactive: { type: "button_reply", button_reply: { id: "slot-2", title: "Mon, 4 May, 10:00am" } },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const message = await adapter.parseInbound(payload);
    expect(message.quickReplyId).toBe("slot-2");
    expect(message.text).toBe("Mon, 4 May, 10:00am");
  });

  it("extracts the quickReplyId from a list reply", async () => {
    const adapter = new WhatsAppChannelAdapter();
    const payload: WhatsAppWebhookPayload = {
      entry: [
        {
          id: "e1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                messages: [
                  {
                    id: "wamid.3",
                    from: "6591234567",
                    timestamp: "1746000000",
                    type: "interactive",
                    interactive: { type: "list_reply", list_reply: { id: "slot-5", title: "Fri, 8 May, 2:00pm" } },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const message = await adapter.parseInbound(payload);
    expect(message.quickReplyId).toBe("slot-5");
  });
});

describe("WhatsAppChannelAdapter.parseInbound — media", () => {
  it("resolves an image message via the injected resolveMedia callback", async () => {
    const adapter = new WhatsAppChannelAdapter({
      resolveMedia: async (mediaId, mimeType) => ({ url: `data:${mimeType};base64,ZmFrZQ==`, mimeType }),
    });
    const payload: WhatsAppWebhookPayload = {
      entry: [
        {
          id: "e1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                messages: [
                  {
                    id: "wamid.4",
                    from: "6591234567",
                    timestamp: "1746000000",
                    type: "image",
                    image: { id: "media-1", mime_type: "image/jpeg" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const message = await adapter.parseInbound(payload);
    expect(message.media).toHaveLength(1);
    expect(message.media![0]!.type).toBe("image");
    expect(message.media![0]!.url).toBe("data:image/jpeg;base64,ZmFrZQ==");
  });

  it("throws a clear error for a media message when no resolveMedia is configured", async () => {
    const adapter = new WhatsAppChannelAdapter();
    const payload: WhatsAppWebhookPayload = {
      entry: [
        {
          id: "e1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                messages: [
                  { id: "wamid.5", from: "6591234567", timestamp: "1746000000", type: "image", image: { id: "media-1", mime_type: "image/jpeg" } },
                ],
              },
            },
          ],
        },
      ],
    };
    await expect(adapter.parseInbound(payload)).rejects.toThrow(/no `resolveMedia` configured/i);
  });
});

describe("WhatsAppChannelAdapter.formatOutbound", () => {
  const adapter = new WhatsAppChannelAdapter();

  it("formats a plain text response", () => {
    const output = adapter.formatOutbound({ text: "Hello!" }, { recipientId: "6591234567" });
    expect(output).toEqual({ messaging_product: "whatsapp", to: "6591234567", type: "text", text: { body: "Hello!" } });
  });

  it("formats up to 3 quick replies as interactive reply buttons", () => {
    const output = adapter.formatOutbound(
      {
        text: "Pick a slot:",
        quickReplies: [
          { id: "slot-1", label: "Mon, 4 May, 9:00am" },
          { id: "slot-2", label: "Mon, 4 May, 10:00am" },
          { id: "slot-3", label: "Mon, 4 May, 11:00am" },
        ],
      },
      { recipientId: "6591234567" }
    );
    expect(output).toMatchObject({ type: "interactive", interactive: { type: "button" } });
    const buttons = (output as { interactive: { action: { buttons: unknown[] } } }).interactive.action.buttons;
    expect(buttons).toHaveLength(3);
  });

  it("formats more than 3 quick replies as an interactive list instead", () => {
    const quickReplies = Array.from({ length: 5 }, (_, i) => ({ id: `slot-${i + 1}`, label: `Option ${i + 1}` }));
    const output = adapter.formatOutbound({ text: "Pick one:", quickReplies }, { recipientId: "6591234567" });
    expect(output).toMatchObject({ type: "interactive", interactive: { type: "list" } });
    const rows = (output as { interactive: { action: { sections: { rows: unknown[] }[] } } }).interactive.action.sections[0]!.rows;
    expect(rows).toHaveLength(5);
  });

  it("truncates a button title longer than WhatsApp's 20-character limit", () => {
    const output = adapter.formatOutbound(
      { quickReplies: [{ id: "slot-1", label: "This label is way too long for a WhatsApp button" }] },
      { recipientId: "6591234567" }
    );
    const buttons = (output as { interactive: { action: { buttons: { reply: { title: string } }[] } } }).interactive.action.buttons;
    expect(buttons[0]!.reply.title.length).toBeLessThanOrEqual(20);
  });

  it("formats a media response as an image message", () => {
    const output = adapter.formatOutbound(
      { text: "Here's your recipe photo", media: [{ type: "image", url: "https://example.com/pic.jpg" }] },
      { recipientId: "6591234567" }
    );
    expect(output).toEqual({
      messaging_product: "whatsapp",
      to: "6591234567",
      type: "image",
      image: { link: "https://example.com/pic.jpg", caption: "Here's your recipe photo" },
    });
  });
});
