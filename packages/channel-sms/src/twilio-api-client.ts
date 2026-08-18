import type { SmsOutboundMessage } from "./sms-types.js";

const DEFAULT_API_BASE_URL = "https://api.twilio.com/2010-04-01";

export interface TwilioApiClientConfig {
  accountSid: string;
  authToken: string;
  /** The business's own Twilio number (or messaging service SID) — Twilio's per-request `From` field. */
  fromNumber: string;
  apiBaseUrl?: string;
  /** Override point for tests — never a live network call in the test suite. */
  fetch?: typeof fetch;
}

export interface ResolvedSmsMedia {
  /** A `data:` URI — Twilio media URLs require Basic Auth and could otherwise leak the account's credentials to a downstream AIProvider's own fetch. */
  url: string;
  mimeType: string;
}

/** Thin wrapper over the Twilio REST API — the only place in this package that makes HTTP calls to Twilio. */
export class TwilioApiClient {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: TwilioApiClientConfig) {
    this.accountSid = config.accountSid;
    this.authToken = config.authToken;
    this.fromNumber = config.fromNumber;
    this.apiBaseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.fetchImpl = config.fetch ?? fetch;
  }

  private basicAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`;
  }

  async sendMessage(message: SmsOutboundMessage): Promise<void> {
    const form = new URLSearchParams({ To: message.to, From: this.fromNumber, Body: message.body });
    const response = await this.fetchImpl(`${this.apiBaseUrl}/Accounts/${this.accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: this.basicAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!response.ok) {
      throw new Error(`Twilio send failed: ${response.status} ${await response.text()}`);
    }
  }

  async downloadMediaAsDataUri(mediaUrl: string, mimeType: string): Promise<ResolvedSmsMedia> {
    const response = await this.fetchImpl(mediaUrl, { headers: { Authorization: this.basicAuthHeader() } });
    if (!response.ok) {
      throw new Error(`Twilio media download failed: ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return { url: `data:${mimeType};base64,${bytes.toString("base64")}`, mimeType };
  }
}
