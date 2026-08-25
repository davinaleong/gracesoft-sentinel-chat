import type { AIProvider, FindRecipesInput, RecipeSourceProvider, RecipeSourceResult } from "@gracesoft-sentinel/core";
import type { PineconeClient } from "./pinecone-client.js";

/** Below this, a match is discarded as noise rather than presented as "found". See findRecipes's own doc comment for how this number was chosen and its limits. */
const DEFAULT_MIN_SCORE = 0.5;

/**
 * Asks the LLM whether a score-eligible candidate actually answers the
 * chatter's question — catches the near-tie case `minScore` structurally
 * can't (see findRecipes's doc comment): a wrong match scoring 0.522 next
 * to a correct match's own 0.533 for a different query. Cheap relative to
 * the embed+query round trip already paid for, and only runs on candidates
 * that already cleared `minScore`, not every match.
 */
async function isRelevantMatch(query: string, content: string, aiProvider: AIProvider): Promise<boolean> {
  const { text } = await aiProvider.chatComplete({
    messages: [
      {
        role: "system",
        content:
          'You judge whether a recipe answers a chatter\'s request for a specific personal recipe. Reply with exactly one word: "yes" if the recipe is the dish (or a clear variant of it) the chatter asked for, "no" otherwise. A recipe in the same general category but a different dish (e.g. a different soup) is "no".',
      },
      { role: "user", content: `Chatter asked: "${query}"\n\nCandidate recipe:\n${content.slice(0, 1500)}` },
    ],
    temperature: 0,
    maxTokens: 5,
  });
  return text.trim().toLowerCase().startsWith("yes");
}

export interface PineconeRecipeProviderConfig {
  client: PineconeClient;
  aiProvider: AIProvider;
  /** How many matches `findRecipes` returns at most. Defaults to 3. */
  topK?: number;
  /**
   * Minimum cosine-similarity score (0-1) for a match to be returned at
   * all, rather than the closest-available-but-actually-unrelated result
   * being presented as "found". Defaults to 0.5.
   */
  minScore?: number;
  /**
   * Whether each score-eligible candidate is also checked with an LLM call
   * ("does this recipe actually answer the question?") before being
   * returned. Defaults to true. Set false to skip the extra latency/cost
   * and rely on `minScore` alone.
   */
  verifyRelevance?: boolean;
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

  /**
   * `minScore` alone is a coarse safety net, not a precision filter: on
   * short, structurally-similar recipe text (every document shares headers
   * like "Category:"/"Ingredients:"/"Steps:"), a genuinely-correct match and
   * a plausible-but-wrong one can score within ~0.01 of each other — e.g.
   * asking for "chicken soup" (not in the index) scored 0.522 against an
   * unrelated tomato soup recipe, barely below a *correct* chocolate-cake
   * match's own 0.533 for its own query. No threshold can separate a
   * same-category near-miss from a real match on score alone; `minScore`
   * only catches the clearly-irrelevant tail (unrelated dishes scored
   * 0.30-0.40 in the same test). The near-tie case is what `verifyRelevance`
   * (on by default) is for — an LLM asked "does this actually answer the
   * question?" for each score-eligible candidate.
   */
  async findRecipes(input: FindRecipesInput): Promise<RecipeSourceResult[]> {
    const { vectors } = await this.config.aiProvider.embed({ input: input.query });
    const queryVector = vectors[0];
    if (!queryVector) return [];

    const { matches } = await this.config.client.query({ vector: queryVector, topK: this.config.topK ?? 3 });
    const minScore = this.config.minScore ?? DEFAULT_MIN_SCORE;
    const verifyRelevance = this.config.verifyRelevance ?? true;

    const results: RecipeSourceResult[] = [];
    for (const match of matches) {
      if (match.score !== undefined && match.score < minScore) continue;
      const metadata = match.metadata;
      if (!metadata) continue;
      // "name"/"text" (not "title"/"content") — matches whatever ingestion
      // actually wrote this record's metadata, whether that's this
      // package's own sync-drive-recipes.ts or an external sync pipeline
      // populating the same index. Keep both in step if this ever changes.
      const title = typeof metadata.name === "string" ? metadata.name : match.id;
      const content = typeof metadata.text === "string" ? metadata.text : undefined;
      if (!content) continue;
      if (verifyRelevance && !(await isRelevantMatch(input.query, content, this.config.aiProvider))) continue;
      results.push({ id: match.id, title, raw: { content } });
    }
    return results;
  }

  /**
   * Enumerates every recipe in the index — no embedding/query involved,
   * just `PineconeClient.listAll()`. The external sync pipeline can split
   * one source document into several vectors (one per section, e.g.
   * "Ingredients"/"Steps"), all sharing the same `fileId` metadata field;
   * grouping by `fileId` (falling back to the vector id when absent) is
   * what keeps "how many recipes do I have" counting recipes, not chunks.
   */
  async listRecipes(): Promise<RecipeSourceResult[]> {
    const records = await this.config.client.listAll();

    const byRecipe = new Map<string, RecipeSourceResult>();
    for (const record of records) {
      const metadata = record.metadata;
      if (!metadata) continue;
      const groupKey = typeof metadata.fileId === "string" ? metadata.fileId : record.id;
      if (byRecipe.has(groupKey)) continue;
      const title = typeof metadata.name === "string" ? metadata.name : record.id;
      byRecipe.set(groupKey, { id: groupKey, title });
    }
    return [...byRecipe.values()];
  }
}
