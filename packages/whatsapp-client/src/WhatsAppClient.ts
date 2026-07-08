import axios, { AxiosInstance, isAxiosError } from "axios";
import type {
  WhatsAppSendRequest,
  ResolvedMedia,
} from "./types";
import { WhatsAppApiError } from "./errors";

export interface WhatsAppClientConfig {
  phoneNumberId: string;
  accessToken: string;
  /** Defaults to "v20.0" */
  apiVersion?: string;
}

/**
 * Thin wrapper around the WhatsApp Cloud API.
 * Handles sending messages and resolving / downloading inbound media.
 */
export class WhatsAppClient {
  private readonly http: AxiosInstance;
  private readonly phoneNumberId: string;

  constructor(config: WhatsAppClientConfig) {
    const version = config.apiVersion ?? "v20.0";
    this.phoneNumberId = config.phoneNumberId;

    this.http = axios.create({
      baseURL: `https://graph.facebook.com/${version}`,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  /** Send a plain text message to a WhatsApp number */
  async sendText(to: string, text: string): Promise<void> {
    const body: WhatsAppSendRequest = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    };
    await this.send(body);
  }

  /** Send an image message using a publicly accessible URL */
  async sendImage(to: string, link: string, caption?: string): Promise<void> {
    const body: WhatsAppSendRequest = {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { link, ...(caption ? { caption } : {}) },
    };
    await this.send(body);
  }

  // ── Media ─────────────────────────────────────────────────────────────────

  /**
   * Resolves a WhatsApp media ID to a pre-signed download URL + MIME type.
   * The URL is valid for approximately 5 minutes.
   */
  async getMediaUrl(mediaId: string): Promise<ResolvedMedia> {
    try {
      const { data } = await this.http.get<{
        url: string;
        mime_type: string;
        id: string;
      }>(`/${mediaId}`);
      return { url: data.url, mimeType: data.mime_type };
    } catch (err) {
      throw this.wrapError(err, `Failed to retrieve media URL for id=${mediaId}`);
    }
  }

  /**
   * Downloads a media file by its WhatsApp media ID and returns the raw bytes.
   * Use `getMediaUrl()` when you only need the URL without downloading.
   */
  async downloadMedia(mediaId: string): Promise<Buffer> {
    const { url } = await this.getMediaUrl(mediaId);
    try {
      const response = await this.http.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
      });
      return Buffer.from(response.data);
    } catch (err) {
      throw this.wrapError(err, `Failed to download media id=${mediaId}`);
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async send(body: WhatsAppSendRequest): Promise<void> {
    try {
      await this.http.post(`/${this.phoneNumberId}/messages`, body);
    } catch (err) {
      throw this.wrapError(err, "Failed to send WhatsApp message");
    }
  }

  private wrapError(err: unknown, context: string): WhatsAppApiError {
    if (isAxiosError(err)) {
      const status = err.response?.status ?? 0;
      const apiErr = err.response?.data?.error;
      const message = apiErr?.message
        ? `${context}: ${apiErr.message}`
        : `${context}: HTTP ${status}`;
      return new WhatsAppApiError(
        message,
        status,
        apiErr?.code,
        apiErr?.error_subcode
      );
    }
    return new WhatsAppApiError(
      `${context}: ${err instanceof Error ? err.message : String(err)}`,
      0
    );
  }
}
