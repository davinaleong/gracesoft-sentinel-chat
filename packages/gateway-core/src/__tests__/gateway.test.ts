import { createGateway, MENU_TEXT } from "@sentinel/gateway-core";
import type { AppModule, AppInput, GatewayInput } from "@sentinel/gateway-core";

// ── Mock app modules ───────────────────────────────────────────────────────

const mockConcierge: AppModule = {
  name: "concierge",
  async handle(input: AppInput) {
    if (input.session === null) {
      return {
        reply: "Concierge: what date?",
        session: { step: "awaiting_date" },
        status: "active" as const,
      };
    }
    if (input.text?.toLowerCase() === "confirm") {
      return { reply: "Booking confirmed!", session: null, status: "done" as const };
    }
    return {
      reply: "Concierge: please confirm",
      session: input.session,
      status: "active" as const,
    };
  },
  tryFaq(text: string) {
    if (text.toLowerCase().includes("hours")) {
      return { text: "We are open 9am–5pm Mon–Fri." };
    }
    return null;
  },
};

const mockCook: AppModule = {
  name: "cook",
  async handle(input: AppInput) {
    if (input.media?.type === "image") {
      return { reply: "Recipe: Fried Rice ...", session: null, status: "done" as const };
    }
    if (input.session === null) {
      return {
        reply: "Cook: please send a photo",
        session: { step: "awaiting_photo" },
        status: "active" as const,
      };
    }
    return {
      reply: "Cook: still waiting for a photo",
      session: input.session,
      status: "active" as const,
    };
  },
  tryFaq(text: string) {
    if (text.toLowerCase().includes("how does cook")) {
      return { text: "Just send a dish photo!" };
    }
    return null;
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function input(from: string, text?: string): GatewayInput {
  return { from, text };
}

function photoInput(from: string): GatewayInput {
  return { from, media: { type: "image", url: "https://example.com/photo.jpg" } };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("gateway-core: createGateway", () => {
  let gateway: ReturnType<typeof createGateway>;

  beforeEach(() => {
    gateway = createGateway([mockConcierge, mockCook]);
  });

  // ── Menu ───────────────────────────────────────────────────────────────

  it("returns the menu on cold start (no text)", async () => {
    const out = await gateway.process(input("whatsapp:111"));
    expect(out.to).toBe("whatsapp:111");
    expect(out.reply).toBe(MENU_TEXT);
  });

  it("returns the menu for unrecognised input", async () => {
    const out = await gateway.process(input("whatsapp:111", "hello there"));
    expect(out.reply).toBe(MENU_TEXT);
  });

  // ── Global FAQ ─────────────────────────────────────────────────────────

  it("answers global FAQ: 'what is sentinel'", async () => {
    const out = await gateway.process(input("whatsapp:111", "what is sentinel"));
    expect(typeof out.reply).toBe("string");
    expect(out.reply).toContain("Sentinel");
  });

  it("answers global FAQ: 'what is concierge'", async () => {
    const out = await gateway.process(input("whatsapp:111", "what is concierge"));
    expect(out.reply).toContain("Concierge");
  });

  // ── WhatsApp: menu → Concierge → booking → done ────────────────────────

  it("routes '1' to Concierge and returns intro", async () => {
    const out = await gateway.process(input("whatsapp:222", "1"));
    expect(out.reply).toContain("Concierge");
  });

  it("continues Concierge session across multiple turns", async () => {
    await gateway.process(input("whatsapp:333", "1"));
    const out = await gateway.process(input("whatsapp:333", "some text"));
    expect(out.reply).toContain("Concierge");
  });

  it("tears down session and returns menu when Concierge is done", async () => {
    await gateway.process(input("whatsapp:444", "1"));
    const out = await gateway.process(input("whatsapp:444", "confirm"));
    const replies = Array.isArray(out.reply) ? out.reply : [out.reply];
    expect(replies.some((r: string) => r === MENU_TEXT)).toBe(true);
  });

  // ── WhatsApp: menu → Cook → photo → done ──────────────────────────────

  it("routes '2' to Cook and prompts for photo", async () => {
    const out = await gateway.process(input("whatsapp:555", "2"));
    expect(out.reply).toContain("Cook");
  });

  it("returns recipe when Cook receives a photo", async () => {
    await gateway.process(input("whatsapp:666", "2"));
    const out = await gateway.process(photoInput("whatsapp:666"));
    const replies = Array.isArray(out.reply) ? out.reply : [out.reply];
    expect(replies.some((r: string) => r.includes("Recipe"))).toBe(true);
  });

  // ── Cold photo → Cook auto-route ───────────────────────────────────────

  it("auto-routes cold photo to Cook", async () => {
    const out = await gateway.process(photoInput("whatsapp:777"));
    const replies = Array.isArray(out.reply) ? out.reply : [out.reply];
    expect(replies.some((r: string) => r.includes("Recipe"))).toBe(true);
  });

  // ── Global escape hatch ────────────────────────────────────────────────

  it("'menu' mid-flow clears session and returns menu", async () => {
    await gateway.process(input("whatsapp:888", "1")); // start Concierge
    const out = await gateway.process(input("whatsapp:888", "menu"));
    expect(out.reply).toBe(MENU_TEXT);
  });

  it("'0' mid-flow clears session and returns menu", async () => {
    await gateway.process(input("whatsapp:999", "2")); // start Cook
    const out = await gateway.process(input("whatsapp:999", "0"));
    expect(out.reply).toBe(MENU_TEXT);
  });

  it("after escape, user can select an app again", async () => {
    await gateway.process(input("whatsapp:aaa", "1"));
    await gateway.process(input("whatsapp:aaa", "menu"));
    const out = await gateway.process(input("whatsapp:aaa", "2")); // re-select Cook
    expect(out.reply).toContain("Cook");
  });

  // ── In-app FAQ ─────────────────────────────────────────────────────────

  it("handles in-app FAQ (Concierge: hours) without advancing flow", async () => {
    await gateway.process(input("whatsapp:bbb", "1"));
    const out = await gateway.process(input("whatsapp:bbb", "what are your hours"));
    expect(out.reply).toContain("9am");
    // Session still active (not torn down by FAQ)
    const next = await gateway.process(input("whatsapp:bbb", "some text"));
    expect(out.to).toBe("whatsapp:bbb");
    expect(next.reply).toContain("Concierge");
  });

  it("handles in-app FAQ (Cook: how does cook work)", async () => {
    await gateway.process(input("whatsapp:ccc", "2"));
    const out = await gateway.process(input("whatsapp:ccc", "how does cook work"));
    expect(out.reply).toContain("photo");
  });

  // ── Session isolation ──────────────────────────────────────────────────

  it("two concurrent users have isolated sessions", async () => {
    await gateway.process(input("whatsapp:user1", "1")); // user1 → Concierge
    await gateway.process(input("whatsapp:user2", "2")); // user2 → Cook

    const out1 = await gateway.process(input("whatsapp:user1", "some text"));
    const out2 = await gateway.process(input("whatsapp:user2", "some text"));

    expect(out1.reply).toContain("Concierge");
    expect(out2.reply).toContain("Cook");
  });

  it("same user ID on different channels has isolated sessions", async () => {
    await gateway.process(input("whatsapp:123", "1")); // WhatsApp → Concierge
    const telegramOut = await gateway.process(input("telegram:123", "some text")); // Telegram same numeric ID

    // Telegram user must NOT have inherited WhatsApp user's Concierge session
    expect(telegramOut.reply).toBe(MENU_TEXT);
    expect(telegramOut.to).toBe("telegram:123");

    // WhatsApp user must still be in Concierge
    const waOut = await gateway.process(input("whatsapp:123", "some text"));
    expect(waOut.reply).toContain("Concierge");
  });

  // ── Telegram flows (same assertions, different channel prefix) ──────────

  it("Telegram: cold photo auto-routes to Cook", async () => {
    const out = await gateway.process(photoInput("telegram:456"));
    const replies = Array.isArray(out.reply) ? out.reply : [out.reply];
    expect(replies.some((r: string) => r.includes("Recipe"))).toBe(true);
  });

  it("Telegram: '1' → Concierge → 'menu' → back to menu", async () => {
    await gateway.process(input("telegram:789", "1"));
    const out = await gateway.process(input("telegram:789", "menu"));
    expect(out.reply).toBe(MENU_TEXT);
  });
});
