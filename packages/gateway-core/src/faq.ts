import type { FaqEntry } from "./types";

const GLOBAL_FAQ: FaqEntry[] = [
  {
    keywords: ["what is this", "what is sentinel", "about sentinel"],
    answer:
      "Sentinel is your AI assistant on WhatsApp and Telegram. " +
      "It has two services: *Concierge* for bookings and *Cook* for dish photos. " +
      "Reply *1* for Concierge or *2* for Cook.",
  },
  {
    keywords: ["what is concierge", "about concierge"],
    answer:
      "Concierge helps you check availability and book appointments. " +
      "Reply *1* to start.",
  },
  {
    keywords: ["what is cook", "about cook"],
    answer:
      "Cook analyses a dish photo and returns a recipe with nutritional info. " +
      "Reply *2* to start, or just send a food photo.",
  },
  {
    keywords: ["help", "how does this work", "what can you do"],
    answer:
      "Reply *1* for Concierge (bookings) or *2* for Cook (dish photos). " +
      "Type *menu* or *0* at any time to return to this menu.",
  },
];

/**
 * Checks user input against the global top-level FAQ.
 * Returns a match object if found, or null.
 */
export function tryGlobalFaq(text: string): { text: string } | null {
  const lower = text.toLowerCase().trim();
  for (const entry of GLOBAL_FAQ) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return { text: entry.answer };
    }
  }
  return null;
}
