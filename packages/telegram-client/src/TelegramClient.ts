import axios, { AxiosInstance, isAxiosError } from "axios";
import type {
  TelegramApiResponse,
  TelegramFile,
  ResolvedMedia,
} from "./types";
import { TelegramApiError } from "./errors";

export interface TelegramClientConfig {
  botToken: string;
  /** Defaults to "https://api.telegram.org" */
  baseUrl?: string;
}

/**
 * Thin wrapper around the Telegram Bot API.
 * Handles sending messages and resolving / downloading inbound media files.
 */
export class TelegramClient {
  private readonly http: AxiosInstance;
  private readonly botToken: string;
  private readonly fileBaseUrl: string;

  constructor(config: TelegramClientConfig) {
    this.botToken = config.botToken;
    const base = config.baseUrl ?? "https://api.telegram.org";
    this.fileBaseUrl = `${base}/file/bot${this.botToken}`;

    this.http = axios.create({
      baseURL: `${base}/bot${this.botToken}`,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  /** Send a plain text message to a chat */
  async sendText(chatId: number | string, text: string): Promise<void> {
    await this.call("sendMessage", { chat_id: chatId, text });
  }

  /** Send a photo to a chat using a publicly accessible URL */
  async sendPhoto(
    chatId: number | string,
    photoUrl: string,
    caption?: string
  ): Promise<void> {
    await this.call("sendPhoto", {
      chat_id: chatId,
      photo: photoUrl,
      ...(caption ? { caption } : {}),
    });
  }

  // ── Media ─────────────────────────────────────────────────────────────────

  /**
   * Resolves a Telegram file_id to a direct download URL.
   * The URL is valid for at least 1 hour.
   */
  async getFileUrl(fileId: string): Promise<ResolvedMedia> {
    const file = await this.call<TelegramFile>("getFile", { file_id: fileId });
    if (!file.file_path) {
      throw new TelegramApiError(
        `getFile returned no file_path for file_id=${fileId}`,
        0
      );
    }
    return { url: `${this.fileBaseUrl}/${file.file_path}` };
  }

  /**
   * Downloads a file by its Telegram file_id and returns the raw bytes.
   */
  async downloadFile(fileId: string): Promise<Buffer> {
    const { url } = await this.getFileUrl(fileId);
    try {
      const response = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
      });
      return Buffer.from(response.data);
    } catch (err) {
      throw this.wrapError(err, `Failed to download file_id=${fileId}`);
    }
  }

  // ── Webhook setup ─────────────────────────────────────────────────────────

  /**
   * Registers (or updates) the webhook URL with Telegram.
   * Call once during deployment / startup.
   */
  async registerWebhook(webhookUrl: string, secretToken: string): Promise<void> {
    await this.call("setWebhook", {
      url: webhookUrl,
      secret_token: secretToken,
      allowed_updates: ["message"],
    });
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async call<T>(method: string, params: object): Promise<T> {
    try {
      const { data } = await this.http.post<TelegramApiResponse<T>>(
        `/${method}`,
        params
      );
      if (!data.ok || data.result === undefined) {
        throw new TelegramApiError(
          data.description ?? `Telegram API method ${method} returned ok=false`,
          data.error_code ?? 0
        );
      }
      return data.result;
    } catch (err) {
      if (err instanceof TelegramApiError) throw err;
      throw this.wrapError(err, `Telegram API call ${method} failed`);
    }
  }

  private wrapError(err: unknown, context: string): TelegramApiError {
    if (isAxiosError(err)) {
      const status = err.response?.status ?? 0;
      const desc =
        (err.response?.data as TelegramApiResponse<unknown>)?.description;
      const code =
        (err.response?.data as TelegramApiResponse<unknown>)?.error_code ?? status;
      return new TelegramApiError(
        desc ? `${context}: ${desc}` : `${context}: HTTP ${status}`,
        code
      );
    }
    return new TelegramApiError(
      `${context}: ${err instanceof Error ? err.message : String(err)}`,
      0
    );
  }
}
