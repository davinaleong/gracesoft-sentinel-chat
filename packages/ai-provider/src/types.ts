/** Supported AI provider identifiers */
export type AiProvider = "openai" | "anthropic";

/** A plain text content part */
export interface AiTextPart {
  type: "text";
  text: string;
}

/** An image URL content part */
export interface AiImagePart {
  type: "image_url";
  image_url: {
    url: string;
    /**
     * Image detail level.
     * Supported by OpenAI ("low" | "high" | "auto"). Ignored by providers that
     * do not support it.
     */
    detail?: "low" | "high" | "auto";
  };
}

export type AiContentPart = AiTextPart | AiImagePart;

/** A single message in a chat conversation */
export interface AiMessage {
  role: "system" | "user" | "assistant";
  /** Either a plain string or an array of content parts (for multi-modal messages) */
  content: string | AiContentPart[];
}

/** Per-call options forwarded to the underlying provider */
export interface AiChatOptions {
  /** Override the client's default model for this call */
  model?: string;
  /** Maximum number of tokens to generate */
  maxTokens?: number;
  /**
   * Hint to the provider to return JSON-formatted output.
   * Best-effort: OpenAI enforces this via `response_format`; other providers
   * rely on the system prompt instruction to comply.
   */
  jsonOutput?: boolean;
}

/** Minimal AI client contract — send messages, receive a string reply */
export interface AiClient {
  chat(messages: AiMessage[], options?: AiChatOptions): Promise<string>;
}

/** Configuration required to instantiate any adapter */
export interface AiClientConfig {
  apiKey: string;
  /** Default model used when no model is specified per-call */
  defaultModel: string;
}
