import type { WhatsAppSendRequest } from "./whatsapp-types.js";

const DEFAULT_API_BASE_URL = "https://graph.facebook.com/v20.0";

export interface WhatsAppApiClientConfig {
  accessToken: string;
  phoneNumberId: string;
  apiBaseUrl?: string;
  /** Override point for tests — never a live network call in the test suite. */
  fetch?: typeof fetch;
}

export interface ResolvedMedia {
  /** A `data:` URI — WhatsApp media URLs require an auth header and expire in minutes, so the
   * bytes are downloaded once here and inlined rather than passed around as a bare link. */
  url: string;
  mimeType: string;
}

/**
 * Thin wrapper over the WhatsApp Cloud API's Graph endpoints — the only
 * place in this package that makes HTTP calls to Meta.
 */
export class WhatsAppApiClient {
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: WhatsAppApiClientConfig) {
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.fetchImpl = config.fetch ?? fetch;
  }

  async sendMessage(body: WhatsAppSendRequest): Promise<void> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`WhatsApp send failed: ${response.status} ${await response.text()}`);
    }
  }

  /** Resolves a media id to bytes and returns them inlined as a `data:` URI. */
  async downloadMediaAsDataUri(mediaId: string): Promise<ResolvedMedia> {
    const metaResponse = await this.fetchImpl(`${this.apiBaseUrl}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!metaResponse.ok) {
      throw new Error(`WhatsApp media lookup failed: ${metaResponse.status} ${await metaResponse.text()}`);
    }
    const meta = (await metaResponse.json()) as { url: string; mime_type: string };

    const fileResponse = await this.fetchImpl(meta.url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!fileResponse.ok) {
      throw new Error(`WhatsApp media download failed: ${fileResponse.status}`);
    }
    const bytes = Buffer.from(await fileResponse.arrayBuffer());

    return { url: `data:${meta.mime_type};base64,${bytes.toString("base64")}`, mimeType: meta.mime_type };
  }
}
