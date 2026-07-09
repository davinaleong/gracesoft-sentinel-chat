import OpenAI from "openai";
import type { AiClient, AiClientConfig, AiMessage, AiChatOptions } from "../types";

export class OpenAIAdapter implements AiClient {
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor(config: AiClientConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.defaultModel = config.defaultModel;
  }

  async chat(messages: AiMessage[], options?: AiChatOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: options?.model ?? this.defaultModel,
      // Our AiMessage format is structurally identical to OpenAI's ChatCompletionMessageParam
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      max_tokens: options?.maxTokens,
      ...(options?.jsonOutput
        ? { response_format: { type: "json_object" as const } }
        : {}),
    });

    return response.choices[0]?.message?.content ?? "";
  }
}
