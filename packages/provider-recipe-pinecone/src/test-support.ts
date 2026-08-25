import type { AIProvider, ChatCompleteInput, ChatCompleteResult, EmbedInput, EmbedResult, TranscribeAudioInput, TranscribeAudioResult, VisionAnalyzeInput, VisionAnalyzeResult } from "@gracesoft-sentinel/core";
import type { GoogleDriveClient } from "@gracesoft-sentinel/provider-drive-google";
import type { PineconeClient, PineconeMatch, PineconeRecord, PineconeUpsertRecord } from "./pinecone-client.js";

export interface FakeDriveFile {
  id: string;
  name: string;
  mimeType?: string;
  content: string;
}

/**
 * In-memory `GoogleDriveClient` for this package's own tests — owned here
 * rather than imported from `provider-drive-google`'s own test-support,
 * since packages in this monorepo don't share test doubles across the
 * package boundary (only `index.ts`'s public exports are ever imported
 * cross-package).
 */
export class FakeGoogleDriveClient implements GoogleDriveClient {
  constructor(private readonly folderContents: FakeDriveFile[]) {}

  files = {
    list: async (): Promise<{ data: { files: { id: string; name: string; mimeType?: string }[] } }> => ({
      data: { files: this.folderContents.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType })) },
    }),
    get: async (params: { fileId: string }): Promise<{ data: string }> => {
      const file = this.folderContents.find((f) => f.id === params.fileId);
      if (!file) throw new Error(`FakeGoogleDriveClient: no file with id ${params.fileId}`);
      return { data: file.content };
    },
    export: async (params: { fileId: string }): Promise<{ data: string }> => {
      const file = this.folderContents.find((f) => f.id === params.fileId);
      if (!file) throw new Error(`FakeGoogleDriveClient: no file with id ${params.fileId}`);
      return { data: file.content };
    },
  };
}

/** In-memory `PineconeClient` — cosine-similarity search over whatever's been upserted, no real Pinecone/HTTP calls. */
export class FakePineconeClient implements PineconeClient {
  private readonly records: PineconeUpsertRecord[] = [];
  public upsertCalls: PineconeUpsertRecord[][] = [];
  public queryCalls: { vector: number[]; topK: number }[] = [];

  async upsert(records: PineconeUpsertRecord[]): Promise<void> {
    this.upsertCalls.push(records);
    for (const record of records) {
      const existingIndex = this.records.findIndex((r) => r.id === record.id);
      if (existingIndex >= 0) this.records[existingIndex] = record;
      else this.records.push(record);
    }
  }

  async query(params: { vector: number[]; topK: number }): Promise<{ matches: PineconeMatch[] }> {
    this.queryCalls.push(params);
    const matches = this.records
      .map((record) => ({ record, score: cosineSimilarity(record.values, params.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, params.topK)
      .map(({ record, score }) => ({ id: record.id, score, metadata: record.metadata }));
    return { matches };
  }

  async listAll(): Promise<PineconeRecord[]> {
    return this.records.map((record) => ({ id: record.id, metadata: record.metadata }));
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
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
 * A tiny deterministic "embedding" — a fixed-vocabulary bag-of-words count,
 * not a real model. Good enough to make similarity ranking behave
 * meaningfully in tests (text sharing more vocabulary words scores higher)
 * without depending on a live embeddings API.
 */
const VOCABULARY = ["chicken", "beef", "fish", "rice", "noodle", "soup", "curry", "vegetable", "sweet", "spicy"];

export function fakeEmbed(text: string): number[] {
  const lower = text.toLowerCase();
  return VOCABULARY.map((word) => (lower.includes(word) ? 1 : 0));
}

/**
 * `AIProvider` stub with real behavior for `embed` (via `fakeEmbed`) and
 * `chatComplete` (defaults to "yes", i.e. every candidate is relevant —
 * override via the constructor to test `PineconeRecipeProvider`'s LLM
 * relevance-verification step rejecting a specific candidate). Every other
 * method is unused here.
 */
export class FakeEmbeddingAiProvider implements AIProvider {
  constructor(private readonly chatCompleteImpl?: (input: ChatCompleteInput) => ChatCompleteResult | Promise<ChatCompleteResult>) {}

  async chatComplete(input: ChatCompleteInput): Promise<ChatCompleteResult> {
    if (this.chatCompleteImpl) return this.chatCompleteImpl(input);
    return { text: "yes" };
  }
  async visionAnalyze(_input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    throw new Error("FakeEmbeddingAiProvider: visionAnalyze not used by this package");
  }
  async transcribeAudio(_input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
    throw new Error("FakeEmbeddingAiProvider: transcribeAudio not used by this package");
  }
  async embed(input: EmbedInput): Promise<EmbedResult> {
    const inputs = Array.isArray(input.input) ? input.input : [input.input];
    return { vectors: inputs.map(fakeEmbed) };
  }
}
