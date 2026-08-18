import type { DishClassification } from "./dish-classifier.js";
import type { PersonalRecipeMatch } from "./personal-recipe.js";
import type { Recipe } from "./recipe-generator.js";

/**
 * Plain-text formatting only — no channel-specific markup. Translating this
 * into WhatsApp/Telegram-flavoured emphasis is a `ChannelAdapter.formatOutbound()`
 * concern, not agent-cook's.
 */
export function formatUnidentifiedDish(classification: DishClassification): string {
  return [
    "I couldn't identify a dish in that photo.",
    classification.note,
    "Please send a clear photo of a dish for me to analyse.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}

export function formatRecipe(recipe: Recipe): string {
  const servingLabel = recipe.servings > 1 ? `(serves ${recipe.servings})` : "(serves 1)";
  const { nutrition } = recipe;

  const lines = [
    `${recipe.dishName} ${servingLabel}`,
    "",
    "Ingredients:",
    recipe.ingredients.map((i) => `- ${i}`).join("\n"),
    "",
    "Recipe:",
    recipe.steps.map((s, idx) => `${idx + 1}. ${s}`).join("\n"),
  ];

  if (recipe.substitutions.length > 0) {
    lines.push("", "Substitutions:", recipe.substitutions.map((s) => `- ${s}`).join("\n"));
  }
  if (recipe.servingSuggestions.length > 0) {
    lines.push("", "Serving suggestions:", recipe.servingSuggestions.map((s) => `- ${s}`).join("\n"));
  }

  lines.push(
    "",
    "Nutrition per serving (approx):",
    `- Calories: ${nutrition.calories} kcal`,
    `- Protein: ${nutrition.protein}`,
    `- Carbs: ${nutrition.carbohydrates}`,
    `- Fat: ${nutrition.fat}`,
    `- Fibre: ${nutrition.fiber}`,
    "",
    "Values are estimates. Not for medical use."
  );

  return lines.join("\n");
}

export function formatPersonalRecipe(match: PersonalRecipeMatch): string {
  return [`Found it! ${match.title}`, "", match.content].join("\n");
}

export function formatGroceryList(items: string[], dishNames: string[]): string {
  return [
    `Grocery list for ${dishNames.join(", ")}:`,
    "",
    items.map((item) => `- ${item}`).join("\n"),
  ].join("\n");
}
