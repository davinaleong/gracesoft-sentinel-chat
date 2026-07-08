import type { FaqEntry } from "@sentinel/gateway-core";

export const COOK_FAQ: FaqEntry[] = [
  {
    keywords: ["how does cook work", "how do i use cook", "what can cook do"],
    answer:
      "Just send a photo of any dish! Cook will identify it and reply with " +
      "the full recipe (ingredients + steps) and nutritional info per serving. 🍽️",
  },
  {
    keywords: ["what dishes", "any dish", "cuisine", "type of food"],
    answer:
      "Cook works with any identifiable dish — local hawker food, Western cuisine, " +
      "home-cooked meals, you name it. The clearer the photo, the better the result.",
  },
  {
    keywords: ["calories", "nutrition", "nutritional"],
    answer:
      "Cook provides approximate nutritional info per serving: " +
      "calories, protein, carbohydrates, fat, and fibre.",
  },
  {
    keywords: ["accurate", "accuracy", "reliable"],
    answer:
      "Nutritional values are estimates from AI analysis and should not be " +
      "used for medical or dietary planning. Always consult a professional.",
  },
];

export function tryCookFaq(text: string): { text: string } | null {
  const lower = text.toLowerCase().trim();
  for (const entry of COOK_FAQ) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return { text: entry.answer };
    }
  }
  return null;
}
