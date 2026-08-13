import OpenAI from "openai";
import type {
  AIProvider,
  ChatCompleteInput,
  ChatCompleteResult,
  EmbedInput,
  EmbedResult,
  VisionAnalyzeInput,
  VisionAnalyzeResult,
} from "@gracesoft-sentinel/core";

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export interface OpenAIProviderConfig {
  apiKey: string;
  /** Default chat-completion model. */
  model?: string;
  /** Vision-capable model for `visionAnalyze`; falls back to `model`. */
  visionModel?: string;
  embeddingModel?: string;
  /** Override point for a mocked HTTP layer — contract tests use this, not live network calls. */
  fetch?: NonNullable<ConstructorParameters<typeof OpenAI>[0]>["fetch"];
  baseURL?: string;
}

function toImageUrl(image: VisionAnalyzeInput["image"]): string {
  return "url" in image ? image.url : `data:${image.mimeType};base64,${image.base64}`;
}

/**
 * Wraps the OpenAI SDK behind the provider-agnostic `AIProvider` interface —
 * `agent-concierge`/`agent-cook` depend on `AIProvider` only, never on this
 * class or the `openai` package directly.
 */
export class OpenAIProvider implements AIProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly visionModel: string;
  private readonly embeddingModel: string;

  constructor(config: OpenAIProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey, fetch: config.fetch, baseURL: config.baseURL });
    this.model = config.model ?? DEFAULT_MODEL;
    this.visionModel = config.visionModel ?? this.model;
    this.embeddingModel = config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  }

  async chatComplete(input: ChatCompleteInput): Promise<ChatCompleteResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      // ChatMessage is structurally identical to OpenAI's ChatCompletionMessageParam.
      messages: input.messages as OpenAI.ChatCompletionMessageParam[],
      temperature: input.temperature,
      max_tokens: input.maxTokens,
    });
    return { text: response.choices[0]?.message?.content ?? "", raw: response };
  }

  async visionAnalyze(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    const response = await this.client.chat.completions.create({
      model: this.visionModel,
      messages: [
        {
          role: "user",
          content: [
            ...(input.prompt ? [{ type: "text" as const, text: input.prompt }] : []),
            { type: "image_url" as const, image_url: { url: toImageUrl(input.image) } },
          ],
        },
      ],
    });
    return { text: response.choices[0]?.message?.content ?? "", raw: response };
  }

  async embed(input: EmbedInput): Promise<EmbedResult> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: input.input,
      // Without this, the SDK defaults to base64 encoding and decodes it
      // client-side — explicit here so the response shape is plain float
      // arrays, matching `EmbedResult`.
      encoding_format: "float",
    });
    return { vectors: response.data.map((d) => d.embedding) };
  }
}

/**
 * Config-driven construction from the process environment — the resolution
 * point service-wiring (Milestone 8) calls into, so no agent or provider
 * code branches on env vars directly.
 */
export function createOpenAIProviderFromEnv(env: NodeJS.ProcessEnv = process.env): OpenAIProvider {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing required env var: OPENAI_API_KEY");
  return new OpenAIProvider({
    apiKey,
    model: env.OPENAI_MODEL,
    visionModel: env.OPENAI_VISION_MODEL,
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
  });
}
