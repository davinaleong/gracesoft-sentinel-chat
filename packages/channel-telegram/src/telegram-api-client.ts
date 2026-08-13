import type { TelegramSendRequest } from "./telegram-types.js";

const DEFAULT_API_BASE_URL = "https://api.telegram.org";

export interface TelegramApiClientConfig {
  botToken: string;
  apiBaseUrl?: string;
  /** Override point for tests — never a live network call in the test suite. */
  fetch?: typeof fetch;
}

export interface ResolvedTelegramFile {
  /** A `data:` URI — Telegram file URLs embed the bot token in the path, so downloading and
   * inlining here avoids handing that token onward to a downstream AIProvider's own fetch. */
  url: string;
  mimeType: string;
}

/**
 * Thin wrapper over the Telegram Bot API — the only place in this package
 * that makes HTTP calls to Telegram.
 */
export class TelegramApiClient {
  private readonly botToken: string;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: TelegramApiClientConfig) {
    this.botToken = config.botToken;
    this.apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.fetchImpl = config.fetch ?? fetch;
  }

  async sendMessage(request: TelegramSendRequest): Promise<void> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}/bot${this.botToken}/${request.method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
    });
    if (!response.ok) {
      throw new Error(`Telegram send failed: ${response.status} ${await response.text()}`);
    }
  }

  /** Registers (or re-registers) the webhook URL Telegram delivers updates to, with a shared secret token. */
  async setWebhook(url: string, secretToken: string): Promise<void> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}/bot${this.botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, secret_token: secretToken }),
    });
    if (!response.ok) {
      throw new Error(`Telegram setWebhook failed: ${response.status} ${await response.text()}`);
    }
  }

  /** Resolves a file id to bytes and returns them inlined as a `data:` URI. */
  async downloadFileAsDataUri(fileId: string, mimeType: string): Promise<ResolvedTelegramFile> {
    const metaResponse = await this.fetchImpl(`${this.apiBaseUrl}/bot${this.botToken}/getFile?file_id=${fileId}`);
    if (!metaResponse.ok) {
      throw new Error(`Telegram getFile failed: ${metaResponse.status} ${await metaResponse.text()}`);
    }
    const meta = (await metaResponse.json()) as { ok: boolean; result: { file_path: string } };
    if (!meta.ok) {
      throw new Error("Telegram getFile returned ok:false");
    }

    const fileResponse = await this.fetchImpl(`${this.apiBaseUrl}/file/bot${this.botToken}/${meta.result.file_path}`);
    if (!fileResponse.ok) {
      throw new Error(`Telegram file download failed: ${fileResponse.status}`);
    }
    const bytes = Buffer.from(await fileResponse.arrayBuffer());

    return { url: `data:${mimeType};base64,${bytes.toString("base64")}`, mimeType };
  }
}
