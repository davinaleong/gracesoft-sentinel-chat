/**
 * Deterministic, rule-based intent detection — same philosophy as
 * `personal-recipe.ts`/`grocery-list.ts`. Distinct from
 * `isPersonalRecipeRequest`: that one requires a possessive/ownership word
 * ("my recipe", "mom's recipe") and looks the dish up from a personal
 * source; this one has no such word — "recipe for chicken noodle soup" —
 * and generates a generic, home-style recipe from scratch instead (the
 * same `generateRecipe()` the photo path already uses). Checked *after*
 * `isPersonalRecipeRequest` in `handleMessage`'s dispatch, so a possessive
 * phrasing still prefers the personal-source lookup when one's configured.
 *
 * Deliberately narrow (two clear phrasings, not a bare "X recipe" pattern)
 * to avoid false-triggering on unrelated sentences that merely contain the
 * word "recipe" — a miss here just falls through to the ordinary
 * prompt-for-a-photo response, not a hard failure, so precision is
 * preferred over recall.
 */
const RECIPE_FOR_PATTERN = /\brecipe\s+(?:for|of)\s+(.+)/i;
const HOW_TO_MAKE_PATTERN = /\bhow\s+(?:do i|can i|to)\s+make\s+(.+)/i;

// Only needed for HOW_TO_MAKE_PATTERN's capture ("how do I make *a* beef
// stew") — RECIPE_FOR_PATTERN's capture starts right after "for"/"of", so
// it never picks up a leading article to begin with.
const LEADING_DETERMINER_PATTERN = /^(?:a|an|the|some)\s+/i;
const TRAILING_FILLER_PATTERN = /[\s,]*(?:please|pls|thanks|thank you)?\s*[?!.]*\s*$/i;

function cleanDishName(raw: string): string | undefined {
  let name = raw.trim();
  name = name.replace(TRAILING_FILLER_PATTERN, "").trim();
  name = name.replace(LEADING_DETERMINER_PATTERN, "").trim();
  return name.length > 0 ? name : undefined;
}

/** Pulls the dish name out of a free recipe-search phrase, or `undefined` if the text doesn't look like one. */
export function extractRecipeSearchDishName(text: string): string | undefined {
  const forMatch = RECIPE_FOR_PATTERN.exec(text);
  if (forMatch) return cleanDishName(forMatch[1]!);

  const howMatch = HOW_TO_MAKE_PATTERN.exec(text);
  if (howMatch) return cleanDishName(howMatch[1]!);

  return undefined;
}

export function isRecipeSearchRequest(text: string): boolean {
  return extractRecipeSearchDishName(text) !== undefined;
}
