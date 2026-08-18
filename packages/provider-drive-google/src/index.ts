export const PACKAGE_NAME = "@gracesoft-sentinel/provider-drive-google";

export { createGoogleDriveClient, GOOGLE_DOC_MIME_TYPE } from "./google-drive-client.js";
export type { GoogleDriveAuthConfig, GoogleDriveClient } from "./google-drive-client.js";
export { GoogleDriveRecipeProvider } from "./google-drive-recipe-provider.js";
export type { GoogleDriveRecipeProviderConfig } from "./google-drive-recipe-provider.js";
export { RecipeEmbeddingsIndex, cosineSimilarity } from "./recipe-embeddings-index.js";
export type { EmbeddedRecipe } from "./recipe-embeddings-index.js";
