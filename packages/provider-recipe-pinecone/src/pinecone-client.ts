import { Pinecone, type RecordMetadata } from "@pinecone-database/pinecone";

export interface PineconeMatch {
  id: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface PineconeUpsertRecord {
  id: string;
  values: number[];
  metadata: Record<string, unknown>;
}

/**
 * The minimal slice of Pinecone's own SDK this package actually calls —
 * same rationale as every other `create*Client` in this monorepo
 * (`GoogleCalendarClient`, `GoogleDriveClient`, `TwilioApiClient`, ...):
 * our own small interface, not the full SDK surface, so tests can
 * substitute an in-memory fake without a live index.
 *
 * Unlike those clients, this one wraps the real SDK object internally
 * rather than casting it directly — Pinecone's own `index()`/`namespace()`
 * chaining and `{records, namespace}`-shaped `upsert` don't structurally
 * match a flat interface the way a REST-ish client like `googleapis` does.
 */
export interface PineconeClient {
  query(params: { vector: number[]; topK: number }): Promise<{ matches: PineconeMatch[] }>;
  upsert(records: PineconeUpsertRecord[]): Promise<void>;
}

export interface PineconeAuthConfig {
  apiKey: string;
  indexName: string;
  /** Keeps recipe vectors isolated from anything else sharing the same index — recommended, not required. */
  namespace?: string;
}

/** Builds the real Pinecone client, scoped to one index (and optionally one namespace within it). */
export function createPineconeClient(config: PineconeAuthConfig): PineconeClient {
  const pc = new Pinecone({ apiKey: config.apiKey });
  const index = pc.index(config.indexName);
  const scoped = config.namespace ? index.namespace(config.namespace) : index;

  return {
    async query({ vector, topK }) {
      const response = await scoped.query({ vector, topK, includeMetadata: true });
      return {
        matches: response.matches.map((match) => ({
          id: match.id,
          score: match.score,
          metadata: match.metadata as Record<string, unknown> | undefined,
        })),
      };
    },
    async upsert(records) {
      // `PineconeUpsertRecord.metadata` is a plain `Record<string, unknown>`
      // for flexibility on our side, narrower than Pinecone's own
      // `RecordMetadata` (string/number/boolean/string[] values only) — safe
      // to cast here since every caller in this package only ever puts
      // plain strings (title/content) into it.
      await scoped.upsert({ records: records.map((r) => ({ id: r.id, values: r.values, metadata: r.metadata as RecordMetadata })) });
    },
  };
}
