export const PACKAGE_NAME = "@gracesoft-sentinel/provider-recipe-pinecone";

export { createPineconeClient } from "./pinecone-client.js";
export type { PineconeAuthConfig, PineconeClient, PineconeMatch, PineconeUpsertRecord } from "./pinecone-client.js";
export { PineconeRecipeProvider } from "./pinecone-recipe-provider.js";
export type { PineconeRecipeProviderConfig } from "./pinecone-recipe-provider.js";
export { syncDriveRecipesToPinecone } from "./sync-drive-recipes.js";
export type { SyncDriveRecipesToPineconeParams, SyncResult } from "./sync-drive-recipes.js";
