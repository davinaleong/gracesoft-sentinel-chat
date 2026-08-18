import type { AIProvider, ChatCompleteInput, ChatCompleteResult, EmbedInput, EmbedResult, TranscribeAudioInput, TranscribeAudioResult, VisionAnalyzeInput, VisionAnalyzeResult } from "@gracesoft-sentinel/core";
import type { GoogleDriveClient } from "./google-drive-client.js";

export interface FakeDriveFile {
  id: string;
  name: string;
  mimeType?: string;
  content: string;
}

/** In-memory `GoogleDriveClient` — a fixed folder listing, no real Drive/HTTP calls. */
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

/**
 * A tiny deterministic "embedding" — a fixed-vocabulary bag-of-words count,
 * not a real model. Good enough to make cosine-similarity ranking behave
 * meaningfully in tests (text sharing more vocabulary words scores higher)
 * without depending on a live embeddings API.
 */
const VOCABULARY = ["chicken", "beef", "fish", "rice", "noodle", "soup", "curry", "vegetable", "sweet", "spicy"];

export function fakeEmbed(text: string): number[] {
  const lower = text.toLowerCase();
  return VOCABULARY.map((word) => (lower.includes(word) ? 1 : 0));
}

/** `AIProvider` stub whose only real behavior is `embed` (via `fakeEmbed`) — every other method is unused by `GoogleDriveRecipeProvider`. */
export class FakeEmbeddingAiProvider implements AIProvider {
  async chatComplete(_input: ChatCompleteInput): Promise<ChatCompleteResult> {
    throw new Error("FakeEmbeddingAiProvider: chatComplete not used by GoogleDriveRecipeProvider");
  }
  async visionAnalyze(_input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    throw new Error("FakeEmbeddingAiProvider: visionAnalyze not used by GoogleDriveRecipeProvider");
  }
  async transcribeAudio(_input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
    throw new Error("FakeEmbeddingAiProvider: transcribeAudio not used by GoogleDriveRecipeProvider");
  }
  async embed(input: EmbedInput): Promise<EmbedResult> {
    const inputs = Array.isArray(input.input) ? input.input : [input.input];
    return { vectors: inputs.map(fakeEmbed) };
  }
}
