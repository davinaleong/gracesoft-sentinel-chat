import { createGoogleDriveClient } from "@gracesoft-sentinel/provider-drive-google";
import { OpenAIProvider } from "@gracesoft-sentinel/provider-ai-openai";
import { createPineconeClient } from "./pinecone-client.js";
import { syncDriveRecipesToPinecone } from "./sync-drive-recipes.js";

/**
 * Standalone entry point for the Drive→Pinecone ingestion step — run this
 * out-of-band (manually, or on a schedule) to (re)populate the index a
 * running `PineconeRecipeProvider` queries at chat time. Not invoked by
 * any service automatically; see the package's `sync` script.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function main(): Promise<void> {
  const driveClient = createGoogleDriveClient({
    serviceAccountEmail: requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    privateKey: requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
  });
  const pineconeClient = createPineconeClient({
    apiKey: requireEnv("PINECONE_API_KEY"),
    indexName: requireEnv("PINECONE_INDEX_NAME"),
    namespace: process.env.PINECONE_NAMESPACE,
  });
  const aiProvider = new OpenAIProvider({ apiKey: requireEnv("OPENAI_API_KEY") });
  const folderId = requireEnv("GOOGLE_DRIVE_RECIPES_FOLDER_ID");

  console.log(`Syncing recipes from Drive folder ${folderId} into Pinecone index...`);
  const result = await syncDriveRecipesToPinecone({ driveClient, pineconeClient, aiProvider, folderId });
  console.log(`Done — ${result.synced} recipe(s) synced, ${result.skipped} skipped (no embedding returned).`);
}

main().catch((err: unknown) => {
  console.error("Sync failed:", err);
  process.exitCode = 1;
});
