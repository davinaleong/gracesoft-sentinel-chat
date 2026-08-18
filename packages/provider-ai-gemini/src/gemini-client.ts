import { GoogleGenerativeAI } from "@google/generative-ai";

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/**
 * The minimal slice of the `@google/generative-ai` SDK this provider
 * actually calls — kept as our own small interface (rather than depending
 * on the full SDK surface everywhere) so tests can substitute an in-memory
 * fake without a real Gemini API key or network call.
 */
export interface GeminiClient {
  generateContent(params: {
    model: string;
    systemInstruction?: string;
    contents: GeminiContent[];
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<{ text: string }>;
  embedContent(params: { model: string; text: string }): Promise<{ values: number[] }>;
}

/** Builds the real `@google/generative-ai` client from an API key. */
export function createGeminiClient(apiKey: string): GeminiClient {
  const client = new GoogleGenerativeAI(apiKey);

  return {
    async generateContent(params) {
      const model = client.getGenerativeModel({
        model: params.model,
        systemInstruction: params.systemInstruction,
      });
      const result = await model.generateContent({
        contents: params.contents,
        generationConfig: {
          temperature: params.temperature,
          maxOutputTokens: params.maxOutputTokens,
        },
      });
      return { text: result.response.text() };
    },

    async embedContent(params) {
      const model = client.getGenerativeModel({ model: params.model });
      const result = await model.embedContent(params.text);
      return { values: result.embedding.values };
    },
  };
}
