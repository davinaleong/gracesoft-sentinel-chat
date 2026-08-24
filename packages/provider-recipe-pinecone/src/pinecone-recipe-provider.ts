import type { AIProvider, FindRecipesInput, RecipeSourceProvider, RecipeSourceResult } from "@gracesoft-sentinel/core";
import type { PineconeClient } from "./pinecone-client.js";

export interface PineconeRecipeProviderConfig {
  client: PineconeClient;
  aiProvider: AIProvider;
  /** How many matches `findRecipes` returns at most. Defaults to 3. */
  topK?: number;
}

/**
 * `RecipeSourceProvider` for the "Mother's Day Edition" (Milestone 11),
 * backed by a Pinecone index rather than an in-memory search built fresh
 * from Google Drive on every process (the original implementation, see
 * git history) — recipe embeddings are indexed ahead of time by a separate
 * ingestion step (`syncDriveRecipesToPinecone`, typically run as a
 * scheduled job, not inline in the request path) and just queried here.
 * This is pure query-time retrieval: embed the chatter's question, ask
 * Pinecone for the nearest vectors, done — no listing/downloading/
 * re-embedding a Drive folder on every lookup, and it scales across
 * multiple service replicas without each holding its own duplicate index.
 */
export class PineconeRecipeProvider implements RecipeSourceProvider {
  constructor(private readonly config: PineconeRecipeProviderConfig) {}

  async findRecipes(input: FindRecipesInput): Promise<RecipeSourceResult[]> {
    const { vectors } = await this.config.aiProvider.embed({ input: input.query });
    const queryVector = vectors[0];
    if (!queryVector) return [];

    const { matches } = await this.config.client.query({ vector: queryVector, topK: this.config.topK ?? 3 });

    const results: RecipeSourceResult[] = [];
    for (const match of matches) {
      const metadata = match.metadata;
      if (!metadata) continue;
      const title = typeof metadata.title === "string" ? metadata.title : match.id;
      const content = typeof metadata.content === "string" ? metadata.content : undefined;
      if (!content) continue;
      results.push({ id: match.id, title, raw: { content } });
    }
    return results;
  }
}
