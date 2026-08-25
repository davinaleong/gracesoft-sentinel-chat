import type { AIProvider } from "@gracesoft-sentinel/core";
import { listRecipeDocuments, type GoogleDriveClient } from "@gracesoft-sentinel/provider-drive-google";
import type { PineconeClient, PineconeUpsertRecord } from "./pinecone-client.js";

export interface SyncDriveRecipesToPineconeParams {
  driveClient: GoogleDriveClient;
  pineconeClient: PineconeClient;
  aiProvider: AIProvider;
  folderId: string;
}

export interface SyncResult {
  /** How many documents were embedded and upserted. */
  synced: number;
  /** How many documents were listed but skipped (the embedding call returned nothing usable). */
  skipped: number;
}

/**
 * The ingestion half of the Pinecone-backed personal-recipe RAG feature:
 * reads every document in a Google Drive folder, embeds each one, and
 * upserts it into Pinecone with its title/content as metadata (so
 * `PineconeRecipeProvider` can read them straight back out of a query
 * match without a second Drive round-trip). Meant to be run out-of-band —
 * a one-off backfill or a scheduled job — not on every chat request; see
 * `sync-cli.ts` for a runnable entry point.
 *
 * Re-running this for the same folder is safe: Pinecone upsert is
 * keyed by id (the Drive file id), so an unchanged document is just
 * overwritten with itself, and an edited document's embedding is
 * refreshed.
 */
export async function syncDriveRecipesToPinecone(params: SyncDriveRecipesToPineconeParams): Promise<SyncResult> {
  const documents = await listRecipeDocuments(params.driveClient, params.folderId);

  const records: PineconeUpsertRecord[] = [];
  let skipped = 0;

  for (const doc of documents) {
    const { vectors } = await params.aiProvider.embed({ input: doc.content });
    const embedding = vectors[0];
    if (!embedding) {
      skipped++;
      continue;
    }
    // "name"/"text" (not "title"/"content") to match PineconeRecipeProvider's
    // read side — see the comment there for why.
    records.push({ id: doc.id, values: embedding, metadata: { name: doc.title, text: doc.content } });
  }

  if (records.length > 0) {
    await params.pineconeClient.upsert(records);
  }

  return { synced: records.length, skipped };
}
