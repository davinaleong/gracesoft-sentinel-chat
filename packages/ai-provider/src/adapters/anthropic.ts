import Anthropic from "@anthropic-ai/sdk";
import type { AiClient, AiClientConfig, AiMessage, AiChatOptions, AiContentPart } from "../types";

/** Fetches an image URL and returns it as a base64-encoded string with its MIME type. */
async function fetchImageAsBase64(url: string): Promise<{
  data: string;
  media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image for Anthropic: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
  const media_type = validTypes.find((t) => contentType.includes(t)) ?? "image/jpeg";

  const buffer = await response.arrayBuffer();
  return { data: Buffer.from(buffer).toString("base64"), media_type };
}

export class AnthropicAdapter implements AiClient {
  private readonly client: Anthropic;
  private readonly defaultModel: string;

  constructor(config: AiClientConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.defaultModel = config.defaultModel;
  }

  async chat(messages: AiMessage[], options?: AiChatOptions): Promise<string> {
    // Anthropic treats system messages as a separate top-level parameter
    const systemText = messages
      .filter((m) => m.role === "system")
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n")
      .trim();

    const conversationMessages = messages.filter((m) => m.role !== "system");

    const response = await this.client.messages.create({
      model: options?.model ?? this.defaultModel,
      max_tokens: options?.maxTokens ?? 1024,
      ...(systemText ? { system: systemText } : {}),
      messages: await Promise.all(
        conversationMessages.map(async (m) => ({
          role: m.role as "user" | "assistant",
          content: await this.convertContent(m.content),
        }))
      ),
    });

    const block = response.content[0];
    return block?.type === "text" ? block.text : "";
  }

  /**
   * Converts our canonical AiContentPart[] to Anthropic's content block array.
   * image_url parts are fetched and base64-encoded (SDK v0.32 supports base64 only).
   */
  private async convertContent(
    content: string | AiContentPart[]
  ): Promise<Anthropic.MessageParam["content"]> {
    if (typeof content === "string") return content;

    return Promise.all(
      content.map(async (part): Promise<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> => {
        if (part.type === "text") {
          return { type: "text", text: part.text };
        }
        // Fetch and base64-encode the image (Anthropic SDK 0.32 does not support URL sources)
        const { data, media_type } = await fetchImageAsBase64(part.image_url.url);
        return {
          type: "image",
          source: { type: "base64", data, media_type },
        };
      })
    );
  }
}

