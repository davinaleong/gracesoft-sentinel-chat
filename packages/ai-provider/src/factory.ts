import type { AiProvider, AiClientConfig, AiClient } from "./types";
import { OpenAIAdapter } from "./adapters/openai";
import { AnthropicAdapter } from "./adapters/anthropic";

export function createAiClient(provider: AiProvider, config: AiClientConfig): AiClient {
  switch (provider) {
    case "openai":
      return new OpenAIAdapter(config);
    case "anthropic":
      return new AnthropicAdapter(config);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported AI provider: ${_exhaustive}`);
    }
  }
}
