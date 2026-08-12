const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "do", "does", "you", "your", "i", "to", "for",
  "of", "in", "on", "at", "and", "or", "it", "can", "what", "how", "me", "my",
]);

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  keywords?: string[];
}

export interface FaqMatchResult {
  entry: FaqEntry;
  confidence: number;
}

export const DEFAULT_FAQ_CONFIDENCE_THRESHOLD = 0.3;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 0 && !STOPWORDS.has(word))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Deterministic keyword-overlap matcher with a confidence score — not an
 * LLM call. Below `threshold` we escalate rather than guess: a shaky match
 * is worse than no match, per Milestone 2's FAQ deliverable.
 */
export function matchFaq(
  text: string,
  blueprint: FaqEntry[],
  threshold: number = DEFAULT_FAQ_CONFIDENCE_THRESHOLD
): FaqMatchResult | null {
  const queryTokens = tokenize(text);
  let best: FaqMatchResult | null = null;

  for (const entry of blueprint) {
    const entryTokens = tokenize([entry.question, ...(entry.keywords ?? [])].join(" "));
    const confidence = jaccardSimilarity(queryTokens, entryTokens);
    if (!best || confidence > best.confidence) {
      best = { entry, confidence };
    }
  }

  if (!best || best.confidence < threshold) return null;
  return best;
}
