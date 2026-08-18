import type { RecipeSourceProvider } from "@gracesoft-sentinel/core";

/**
 * Deterministic, rule-based intent detection — same philosophy as
 * `dietary-adjustment.ts`/`grocery-list.ts`. Only relevant when a
 * `RecipeSourceProvider` is actually configured (the "Mother's Day
 * Edition" — Milestone 11 — is opt-in per deployment); `handleMessage`
 * gates on that.
 */
const PERSONAL_RECIPE_KEYWORDS = [
  "my recipe",
  "my recipes",
  "mom'?s recipe",
  "mother'?s recipe",
  "dad'?s recipe",
  "father'?s recipe",
  "grandma'?s recipe",
  "granny'?s recipe",
  "family recipe",
  "my saved recipe",
];

const PERSONAL_RECIPE_PATTERN = new RegExp(`(${PERSONAL_RECIPE_KEYWORDS.join("|")})`, "i");

export function isPersonalRecipeRequest(text: string): boolean {
  return PERSONAL_RECIPE_PATTERN.test(text);
}

export interface PersonalRecipeMatch {
  title: string;
  content: string;
}

/**
 * Looks up the best-matching personal recipe via RAG (`RecipeSourceProvider.findRecipes`,
 * e.g. `provider-drive-google`'s embeddings search over a Google Drive
 * folder). Unlike the AI-generated `Recipe` type, this content is
 * arbitrary free text the user wrote themselves — there's no structured
 * ingredients/steps shape to validate, so it's returned and displayed
 * as-is.
 */
export async function findPersonalRecipe(query: string, recipeSourceProvider: RecipeSourceProvider): Promise<PersonalRecipeMatch | undefined> {
  const results = await recipeSourceProvider.findRecipes({ query });
  const top = results[0];
  if (!top) return undefined;

  const raw = top.raw as { content?: unknown } | undefined;
  const content = typeof raw?.content === "string" ? raw.content.trim() : undefined;
  if (!content) return undefined;

  return { title: top.title, content };
}
