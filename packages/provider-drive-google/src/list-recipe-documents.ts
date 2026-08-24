import { GOOGLE_DOC_MIME_TYPE, type GoogleDriveClient } from "./google-drive-client.js";

export interface RecipeDocument {
  id: string;
  title: string;
  content: string;
}

async function downloadContent(client: GoogleDriveClient, fileId: string, mimeType: string): Promise<string> {
  if (mimeType === GOOGLE_DOC_MIME_TYPE) {
    const { data } = await client.files.export({ fileId, mimeType: "text/plain" }, { responseType: "text" });
    return data;
  }
  const { data } = await client.files.get({ fileId, alt: "media" }, { responseType: "text" });
  return data;
}

/**
 * Lists every file directly inside a Drive folder and downloads its text
 * content — the Google Docs case is exported to plain text separately
 * (`files.get` doesn't work on those), everything else is downloaded as
 * raw bytes. Files with no id/name, or that come back empty after
 * trimming, are skipped rather than surfaced as a partial document.
 *
 * This is pure Drive I/O — no embedding, no indexing, no opinion about
 * where the results go. It exists so an ingestion process (e.g.
 * `provider-recipe-pinecone`'s Drive→Pinecone sync) can read a personal
 * recipes folder without re-deriving Drive's own file-listing/export
 * quirks itself.
 */
export async function listRecipeDocuments(client: GoogleDriveClient, folderId: string): Promise<RecipeDocument[]> {
  const { data } = await client.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType)",
  });

  const documents: RecipeDocument[] = [];
  for (const file of data.files ?? []) {
    if (!file.id || !file.name) continue;
    const content = await downloadContent(client, file.id, file.mimeType ?? "text/plain");
    if (!content.trim()) continue;
    documents.push({ id: file.id, title: file.name, content: content.trim() });
  }
  return documents;
}
