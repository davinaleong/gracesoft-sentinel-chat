export const PACKAGE_NAME = "@gracesoft-sentinel/provider-drive-google";

export { createGoogleDriveClient, GOOGLE_DOC_MIME_TYPE } from "./google-drive-client.js";
export type { GoogleDriveAuthConfig, GoogleDriveClient } from "./google-drive-client.js";
export { listRecipeDocuments } from "./list-recipe-documents.js";
export type { RecipeDocument } from "./list-recipe-documents.js";
