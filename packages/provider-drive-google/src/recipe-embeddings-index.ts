export interface EmbeddedRecipe {
  id: string;
  title: string;
  content: string;
  embedding: number[];
}

/**
 * Standard cosine similarity — ranges from -1 (opposite) to 1 (identical
 * direction). Zero-vector inputs (e.g. an empty document) score 0 against
 * anything rather than throwing on a division by zero.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * In-memory nearest-neighbor search over embedded recipes — this is the
 * "RAG" retrieval step. A personal recipe folder is small (dozens, not
 * millions, of documents), so a linear scan is the right amount of
 * engineering; a real vector database would be solving a problem this
 * feature doesn't have.
 */
export class RecipeEmbeddingsIndex {
  private readonly items: EmbeddedRecipe[] = [];

  add(item: EmbeddedRecipe): void {
    this.items.push(item);
  }

  get size(): number {
    return this.items.length;
  }

  search(queryEmbedding: number[], topK = 3): EmbeddedRecipe[] {
    return [...this.items]
      .map((item) => ({ item, score: cosineSimilarity(item.embedding, queryEmbedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((r) => r.item);
  }
}
