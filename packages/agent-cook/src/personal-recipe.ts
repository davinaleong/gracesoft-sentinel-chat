import type { RecipeSourceProvider } from "@gracesoft-sentinel/core";

/**
 * Deterministic, rule-based intent detection — same philosophy as
 * `dietary-adjustment.ts`/`grocery-list.ts`. Only relevant when a
 * `RecipeSourceProvider` is actually configured (the "Mother's Day
 * Edition" — Milestone 11 — is opt-in per deployment); `handleMessage`
 * gates on that.
 *
 * A possessive/ownership word followed, within a short span, by "recipe" —
 * in *either* order. A literal-phrase match alone ("my recipe", "mom's
 * recipe") only catches "my recipe for chicken curry" (dish name after
 * "recipe"), not the at-least-as-natural "my mushroom pasta recipe" (dish
 * name in between) — the actual phrasing real chatters use, found via a
 * live WhatsApp demo returning zero matches on exactly that wording. The
 * bounded gap (not `.*`) keeps this from spanning an entire unrelated
 * sentence into a false match.
 */
const POSSESSIVE_WORDS = ["my", "our", "mom'?s", "mother'?s", "dad'?s", "father'?s", "grandma'?s", "granny'?s", "family"];
const GAP = "[^.!?\\n]{0,40}?";
const PERSONAL_RECIPE_PATTERN = new RegExp(`\\b(${POSSESSIVE_WORDS.join("|")})\\b${GAP}\\brecipe|\\brecipe${GAP}\\b(${POSSESSIVE_WORDS.join("|")})\\b`, "i");

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
