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
