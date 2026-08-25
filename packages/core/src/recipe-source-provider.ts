import { z } from "zod";

/**
 * Future-facing contract for the Mother's Day Edition (Milestone 11):
 * retrieving recipes from a personal source (e.g. Google Drive) rather than
 * generating them from scratch. Deliberately minimal — no implementation
 * exists yet, so this is kept small until a real consumer shapes it further.
 */
export const RecipeSourceResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  raw: z.unknown().optional(),
});
export type RecipeSourceResult = z.infer<typeof RecipeSourceResultSchema>;

export const FindRecipesInputSchema = z.object({
  query: z.string(),
});
export type FindRecipesInput = z.infer<typeof FindRecipesInputSchema>;

export interface RecipeSourceProvider {
  findRecipes(input: FindRecipesInput): Promise<RecipeSourceResult[]>;
  /**
   * Every recipe available from this source — for a bare "how many recipes
   * do I have"/"list my recipes" request, not a similarity search. Optional:
   * not every provider can enumerate its full corpus cheaply, so callers
   * must check for this before calling it.
   */
  listRecipes?(): Promise<RecipeSourceResult[]>;
}
