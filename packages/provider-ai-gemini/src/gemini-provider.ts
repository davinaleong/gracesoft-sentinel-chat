import type {
  AIProvider,
  ChatCompleteInput,
  ChatCompleteResult,
  ChatMessage,
  EmbedInput,
  EmbedResult,
  VisionAnalyzeInput,
  VisionAnalyzeResult,
} from "@gracesoft-sentinel/core";
import { createGeminiClient, type GeminiClient, type GeminiContent, type GeminiPart } from "./gemini-client.js";

const DEFAULT_MODEL = "gemini-1.5-flash";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-004";

export interface GeminiProviderConfig {
  client: GeminiClient;
  model?: string;
  visionModel?: string;
  embeddingModel?: string;
  /** Override point for a mocked HTTP layer when resolving a `{url}` image — contract tests use this, not live network calls. */
  fetch?: typeof fetch;
}

/**
 * Gemini has no "system" role in its content array — system instructions
 * are a separate field — and uses "model" rather than "assistant" for the
 * AI's own turns. This is the only place that mapping happens.
 */
function toGeminiContents(messages: ChatMessage[]): { systemInstruction?: string; contents: GeminiContent[] } {
  const systemParts: string[] = [];
  const contents: GeminiContent[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
    } else {
      contents.push({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] });
    }
  }
  return { systemInstruction: systemParts.length > 0 ? systemParts.join("\n\n") : undefined, contents };
}

async function toInlineImagePart(image: VisionAnalyzeInput["image"], fetchImpl: typeof fetch): Promise<GeminiPart> {
  if ("base64" in image) {
    return { inlineData: { mimeType: image.mimeType, data: image.base64 } };
  }
  const response = await fetchImpl(image.url);
  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  const bytes = Buffer.from(await response.arrayBuffer());
  return { inlineData: { mimeType, data: bytes.toString("base64") } };
}

/**
 * Wraps the Gemini API behind the provider-agnostic `AIProvider` interface
 * — the second real (non-OpenAI) implementation, proving the interface
 * genuinely generalises across vendors, not just against the `EchoAiProvider`
 * stub from Milestone 4. Chosen over Anthropic for this slot because
 * Anthropic has no native embeddings API, and `AIProvider.embed` is part of
 * the contract every implementation must satisfy.
 */
export class GeminiProvider implements AIProvider {
  private readonly client: GeminiClient;
  private readonly model: string;
  private readonly visionModel: string;
  private readonly embeddingModel: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: GeminiProviderConfig) {
    this.client = config.client;
    this.model = config.model ?? DEFAULT_MODEL;
    this.visionModel = config.visionModel ?? this.model;
    this.embeddingModel = config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    this.fetchImpl = config.fetch ?? fetch;
  }

  async chatComplete(input: ChatCompleteInput): Promise<ChatCompleteResult> {
    const { systemInstruction, contents } = toGeminiContents(input.messages);
    const result = await this.client.generateContent({
      model: this.model,
      systemInstruction,
      contents,
      temperature: input.temperature,
      maxOutputTokens: input.maxTokens,
    });
    return { text: result.text };
  }

  async visionAnalyze(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    const imagePart = await toInlineImagePart(input.image, this.fetchImpl);
    const parts: GeminiPart[] = input.prompt ? [{ text: input.prompt }, imagePart] : [imagePart];
    const result = await this.client.generateContent({ model: this.visionModel, contents: [{ role: "user", parts }] });
    return { text: result.text };
  }

  async embed(input: EmbedInput): Promise<EmbedResult> {
    const inputs = Array.isArray(input.input) ? input.input : [input.input];
    const vectors = await Promise.all(
      inputs.map((text) => this.client.embedContent({ model: this.embeddingModel, text }).then((r) => r.values))
    );
    return { vectors };
  }
}

/** Config-driven construction from the process environment, mirroring `createOpenAIProviderFromEnv`. */
export function createGeminiProviderFromEnv(env: NodeJS.ProcessEnv): GeminiProvider {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing required env var: GEMINI_API_KEY");
  return new GeminiProvider({
    client: createGeminiClient(apiKey),
    model: env.GEMINI_MODEL,
    visionModel: env.GEMINI_VISION_MODEL,
    embeddingModel: env.GEMINI_EMBEDDING_MODEL,
  });
}
