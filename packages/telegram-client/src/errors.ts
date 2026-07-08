/** Wraps a Telegram Bot API error response */
export class TelegramApiError extends Error {
  readonly errorCode: number;

  constructor(message: string, errorCode: number) {
    super(message);
    this.name = "TelegramApiError";
    this.errorCode = errorCode;
  }
}

/** Raised when the X-Telegram-Bot-Api-Secret-Token header is missing or invalid */
export class WebhookSecretError extends Error {
  constructor() {
    super("Telegram webhook secret token verification failed");
    this.name = "WebhookSecretError";
  }
}
