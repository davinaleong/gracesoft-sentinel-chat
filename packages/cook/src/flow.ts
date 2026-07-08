import type { AppInput, AppOutput } from "@sentinel/gateway-core";
import type { CookSession } from "./types";
import { analyzeDish } from "./openai";
import { formatDishAnalysis } from "./formatter";

const PROMPT_FOR_PHOTO =
  `📸 *Cook* is ready!\n\n` +
  `Send me a photo of any dish and I'll give you:\n` +
  `• The dish name\n` +
  `• Full recipe with ingredients & steps\n` +
  `• Nutritional info per serving\n\n` +
  `Go ahead and snap a photo! 🍜`;

const THINKING = `🔍 Analysing your dish... this may take a moment.`;

export async function handleCook(
  input: AppInput<CookSession>,
  apiKey: string
): Promise<AppOutput<CookSession>> {
  const { media, session } = input;

  // ── First call with a photo (cold auto-route) ──────────────────────────
  if (media?.type === "image") {
    try {
      const analysis = await analyzeDish(media.url, apiKey);
      const reply = formatDishAnalysis(analysis);
      return { reply, session: null, status: "done" };
    } catch (err) {
      console.error("[cook] OpenAI analysis failed:", err);
      return {
        reply:
          `😕 Sorry, I couldn't analyse that photo right now. ` +
          `Please try again in a moment.`,
        session: null,
        status: "done",
      };
    }
  }

  // ── First call without photo (selected via menu) ────────────────────────
  if (session === null) {
    return {
      reply: PROMPT_FOR_PHOTO,
      session: { step: "awaiting_photo" },
      status: "active",
    };
  }

  // ── Awaiting photo but received text ───────────────────────────────────
  if (session.step === "awaiting_photo") {
    return {
      reply:
        `I'm waiting for a dish photo! 📸\n\n` +
        `Please send a food photo for me to analyse.`,
      session,
      status: "active",
    };
  }

  // Fallback
  return { reply: PROMPT_FOR_PHOTO, session: { step: "awaiting_photo" }, status: "active" };
}
