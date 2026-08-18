import type { AIProvider, FindRecipesInput, RecipeSourceProvider, RecipeSourceResult } from "@gracesoft-sentinel/core";
import { GOOGLE_DOC_MIME_TYPE, type GoogleDriveClient } from "./google-drive-client.js";
import { RecipeEmbeddingsIndex } from "./recipe-embeddings-index.js";

export interface GoogleDriveRecipeProviderConfig {
  client: GoogleDriveClient;
  aiProvider: AIProvider;
  /** The Drive folder id containing the personal recipe documents to search over. */
  folderId: string;
  /** How many matches `findRecipes` returns at most. Defaults to 3. */
  topK?: number;
}

/**
 * `RecipeSourceProvider` for the "Mother's Day Edition" (Milestone 11):
 * retrieves a personal recipe from a Google Drive folder via embeddings-
 * based semantic search (RAG), rather than generating one from scratch the
 * way `agent-cook`'s photo-based flow does.
 *
 * The folder is small and personal (a handful to a few dozen documents),
 * so this indexes the whole thing into memory on first use rather than
 * standing up a real vector database — see `RecipeEmbeddingsIndex`.
 */
export class GoogleDriveRecipeProvider implements RecipeSourceProvider {
  private index: RecipeEmbeddingsIndex | undefined;
  private indexing: Promise<RecipeEmbeddingsIndex> | undefined;

  constructor(private readonly config: GoogleDriveRecipeProviderConfig) {}

  async findRecipes(input: FindRecipesInput): Promise<RecipeSourceResult[]> {
    const index = await this.ensureIndex();
    if (index.size === 0) return [];

    const { vectors } = await this.config.aiProvider.embed({ input: input.query });
    const queryEmbedding = vectors[0];
    if (!queryEmbedding) return [];

    return index.search(queryEmbedding, this.config.topK ?? 3).map((match) => ({
      id: match.id,
      title: match.title,
      raw: { content: match.content },
    }));
  }

  private async ensureIndex(): Promise<RecipeEmbeddingsIndex> {
    if (this.index) return this.index;
    this.indexing ??= this.buildIndex();
    this.index = await this.indexing;
    return this.index;
  }

  private async buildIndex(): Promise<RecipeEmbeddingsIndex> {
    const index = new RecipeEmbeddingsIndex();
    const { data } = await this.config.client.files.list({
      q: `'${this.config.folderId}' in parents and trashed = false`,
      fields: "files(id, name, mimeType)",
    });

    for (const file of data.files ?? []) {
      if (!file.id || !file.name) continue;
      const content = await this.downloadContent(file.id, file.mimeType ?? "text/plain");
      if (!content.trim()) continue;

      const { vectors } = await this.config.aiProvider.embed({ input: content });
      const embedding = vectors[0];
      if (!embedding) continue;

      index.add({ id: file.id, title: file.name, content, embedding });
    }

    return index;
  }

  private async downloadContent(fileId: string, mimeType: string): Promise<string> {
    if (mimeType === GOOGLE_DOC_MIME_TYPE) {
      const { data } = await this.config.client.files.export({ fileId, mimeType: "text/plain" }, { responseType: "text" });
      return data;
    }
    const { data } = await this.config.client.files.get({ fileId, alt: "media" }, { responseType: "text" });
    return data;
  }
}
