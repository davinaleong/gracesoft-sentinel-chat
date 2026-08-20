import { describe, expect, it } from "vitest";
import { runChannelAdapterContractTests } from "@gracesoft-sentinel/core/testing";
import { TelegramChannelAdapter } from "./telegram-adapter.js";
import type { TelegramUpdate } from "./telegram-types.js";

function textUpdate(): TelegramUpdate {
  return {
    update_id: 1,
    message: { message_id: 100, date: 1746000000, chat: { id: 999 }, text: "Hi there" },
  };
}

runChannelAdapterContractTests("TelegramChannelAdapter", () => ({
  adapter: new TelegramChannelAdapter(),
  sampleInboundPayload: textUpdate(),
  sampleResponse: { text: "hello back" },
  recipientId: "999",
}));

describe("TelegramChannelAdapter.parseInbound — text", () => {
  it("extracts chat id, text, and a correctly converted timestamp", async () => {
    const adapter = new TelegramChannelAdapter();
    const message = await adapter.parseInbound(textUpdate());
    expect(message.senderId).toBe("999");
    expect(message.text).toBe("Hi there");
    expect(message.channel).toBe("telegram");
    expect(message.timestamp).toBe(new Date(1746000000 * 1000).toISOString());
  });

  it("throws a clear error for an update with neither a message nor a callback query", async () => {
    const adapter = new TelegramChannelAdapter();
    await expect(adapter.parseInbound({ update_id: 2 })).rejects.toThrow(/no message or callback query/i);
  });
});

describe("TelegramChannelAdapter.parseInbound — callback query (booking button reply)", () => {
  it("extracts the quickReplyId from callback_data", async () => {
    const adapter = new TelegramChannelAdapter();
    const update: TelegramUpdate = {
      update_id: 3,
      callback_query: {
        id: "cbq-1",
        data: "slot-2",
        from: { id: 999 },
        message: { message_id: 101, date: 1746000000, chat: { id: 999 } },
      },
    };
    const message = await adapter.parseInbound(update);
    expect(message.quickReplyId).toBe("slot-2");
    expect(message.senderId).toBe("999");
  });
});

describe("TelegramChannelAdapter.parseInbound — media", () => {
  it("resolves the largest photo size via the injected resolveMedia callback", async () => {
    const adapter = new TelegramChannelAdapter({
      resolveMedia: async (fileId, mimeType) => ({ url: `data:${mimeType};base64,ZmFrZQ==`, mimeType }),
    });
    const update: TelegramUpdate = {
      update_id: 4,
      message: {
        message_id: 102,
        date: 1746000000,
        chat: { id: 999 },
        photo: [
          { file_id: "small", width: 90, height: 90 },
          { file_id: "large", width: 800, height: 800 },
        ],
      },
    };
    const message = await adapter.parseInbound(update);
    expect(message.media).toHaveLength(1);
    expect(message.media![0]!.type).toBe("image");
    expect(message.media![0]!.url).toBe("data:image/jpeg;base64,ZmFrZQ==");
  });

  it("throws a clear error for a media message when no resolveMedia is configured", async () => {
    const adapter = new TelegramChannelAdapter();
    const update: TelegramUpdate = {
      update_id: 5,
      message: { message_id: 103, date: 1746000000, chat: { id: 999 }, photo: [{ file_id: "x", width: 1, height: 1 }] },
    };
    await expect(adapter.parseInbound(update)).rejects.toThrow(/no `resolveMedia` configured/i);
  });
});

describe("TelegramChannelAdapter.formatOutbound", () => {
  const adapter = new TelegramChannelAdapter();

  it("formats a plain text response", () => {
    const output = adapter.formatOutbound({ text: "Hello!" }, { recipientId: "999" });
    expect(output).toEqual({ method: "sendMessage", body: { chat_id: "999", text: "Hello!" } });
  });

  it("formats quick replies as an inline keyboard, one button per row", () => {
    const output = adapter.formatOutbound(
      {
        text: "Pick a slot:",
        quickReplies: [
          { id: "slot-1", label: "Mon, 4 May, 9:00am" },
          { id: "slot-2", label: "Mon, 4 May, 10:00am" },
          { id: "slot-3", label: "Mon, 4 May, 11:00am" },
        ],
      },
      { recipientId: "999" }
    );
    expect(output.method).toBe("sendMessage");
    const body = output.body as { reply_markup: { inline_keyboard: { text: string; callback_data: string }[][] } };
    expect(body.reply_markup.inline_keyboard).toHaveLength(3);
    expect(body.reply_markup.inline_keyboard[1]).toEqual([{ text: "Mon, 4 May, 10:00am", callback_data: "slot-2" }]);
  });

  it("formats a media response as sendPhoto", () => {
    const output = adapter.formatOutbound(
      { text: "Here's your recipe photo", media: [{ type: "image", url: "https://example.com/pic.jpg" }] },
      { recipientId: "999" }
    );
    expect(output).toEqual({
      method: "sendPhoto",
      body: { chat_id: "999", photo: "https://example.com/pic.jpg", caption: "Here's your recipe photo" },
    });
  });
});
