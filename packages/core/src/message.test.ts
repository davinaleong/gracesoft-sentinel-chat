import { describe, expect, it } from "vitest";
import { NormalizedMessageSchema, NormalizedResponseSchema } from "./message.js";

describe("NormalizedMessageSchema", () => {
  it("accepts a minimal text message", () => {
    const result = NormalizedMessageSchema.safeParse({
      id: "msg-1",
      channel: "whatsapp",
      senderId: "+6591234567",
      timestamp: "2026-05-01T09:00:00+08:00",
      text: "hello",
      raw: { anything: "goes here" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a message with media and a quick-reply id, no text", () => {
    const result = NormalizedMessageSchema.safeParse({
      id: "msg-2",
      channel: "telegram",
      senderId: "123456",
      timestamp: "2026-05-01T09:00:00+08:00",
      media: [{ type: "image", url: "https://example.com/dish.jpg" }],
      quickReplyId: "slot-2",
      raw: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects a message missing required fields", () => {
    const result = NormalizedMessageSchema.safeParse({
      channel: "whatsapp",
      text: "hello",
    });
    expect(result.success).toBe(false);
  });
});

describe("NormalizedResponseSchema", () => {
  it("accepts an empty response object (all fields optional)", () => {
    expect(NormalizedResponseSchema.safeParse({}).success).toBe(true);
  });

  it("accepts text with quick replies", () => {
    const result = NormalizedResponseSchema.safeParse({
      text: "Pick a slot:",
      quickReplies: [
        { id: "slot-1", label: "Mon 4 May, 10:00am" },
        { id: "slot-2", label: "Mon 4 May, 2:00pm" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a quick reply missing a label", () => {
    const result = NormalizedResponseSchema.safeParse({
      quickReplies: [{ id: "slot-1" }],
    });
    expect(result.success).toBe(false);
  });
});
