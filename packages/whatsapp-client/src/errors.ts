/** Wraps a WhatsApp Cloud API error response */
export class WhatsAppApiError extends Error {
  readonly statusCode: number;
  readonly errorCode?: number;
  readonly errorSubcode?: number;

  constructor(
    message: string,
    statusCode: number,
    errorCode?: number,
    errorSubcode?: number
  ) {
    super(message);
    this.name = "WhatsAppApiError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.errorSubcode = errorSubcode;
  }
}

/** Raised when the incoming X-Hub-Signature-256 does not match */
export class WebhookSignatureError extends Error {
  constructor() {
    super("Webhook signature verification failed");
    this.name = "WebhookSignatureError";
  }
}
