import { google } from "googleapis";

/**
 * The minimal slice of the `googleapis` Drive v3 client this provider
 * actually calls — same rationale as `provider-calendar-google`'s
 * `GoogleCalendarClient`: our own small interface, not the full SDK
 * surface, so tests can substitute an in-memory fake without HTTP mocking.
 */
export interface GoogleDriveClient {
  files: {
    list(params: { q: string; fields: string; pageSize?: number }): Promise<{
      data: { files?: { id?: string | null; name?: string | null; mimeType?: string | null }[] };
    }>;
    /** Downloads a regular file's raw bytes as text (`alt: "media"`). */
    get(params: { fileId: string; alt: "media" }, options: { responseType: "text" }): Promise<{ data: string }>;
    /** Exports a Google Docs/Sheets/Slides file to a plain-text representation — `get` doesn't work on these. */
    export(params: { fileId: string; mimeType: string }, options: { responseType: "text" }): Promise<{ data: string }>;
  };
}

export interface GoogleDriveAuthConfig {
  serviceAccountEmail: string;
  privateKey: string;
}

const GOOGLE_DOC_MIME_TYPE = "application/vnd.google-apps.document";

/**
 * Builds the real `googleapis` client, authenticated via a service-account
 * JWT scoped read-only to Drive — this provider only ever reads a personal
 * recipes folder, never writes to it.
 */
export function createGoogleDriveClient(config: GoogleDriveAuthConfig): GoogleDriveClient {
  const auth = new google.auth.JWT(
    config.serviceAccountEmail,
    undefined,
    config.privateKey.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/drive.readonly"]
  );
  // Same rationale as the calendar client: the real SDK's methods are
  // overloaded in ways that don't structurally match our minimal interface —
  // safe to cast since we only ever call the single-argument promise form.
  return google.drive({ version: "v3", auth }) as unknown as GoogleDriveClient;
}

export { GOOGLE_DOC_MIME_TYPE };
