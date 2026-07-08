import type { DishAnalysis } from "./openai";

/**
 * Formats a DishAnalysis result into WhatsApp/Telegram-friendly text.
 * Uses *bold* (WhatsApp asterisk format) for section headers.
 */
export function formatDishAnalysis(analysis: DishAnalysis): string {
  if (!analysis.dishName) {
    return (
      `😕 I couldn't identify a dish in that photo.\n\n` +
      (analysis.note ? `${analysis.note}\n\n` : "") +
      `Please send a clear photo of a dish for me to analyse.`
    );
  }

  const servingLabel =
    analysis.servings > 1
      ? `(serves ${analysis.servings})`
      : "(serves 1)";

  const ingredients = analysis.ingredients
    .map((i) => `• ${i}`)
    .join("\n");

  const steps = analysis.steps
    .map((s, idx) => `${idx + 1}. ${s}`)
    .join("\n");

  const { nutrition } = analysis;

  return [
    `🍽️ *${analysis.dishName}* ${servingLabel}`,
    ``,
    `*Ingredients:*`,
    ingredients,
    ``,
    `*Recipe:*`,
    steps,
    ``,
    `*Nutrition per serving (approx):*`,
    `• Calories: ${nutrition.calories} kcal`,
    `• Protein: ${nutrition.protein}`,
    `• Carbs: ${nutrition.carbohydrates}`,
    `• Fat: ${nutrition.fat}`,
    `• Fibre: ${nutrition.fiber}`,
    ``,
    `_Values are estimates. Not for medical use._`,
  ].join("\n");
}
