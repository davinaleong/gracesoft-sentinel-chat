import type { GeminiClient, GeminiContent } from "./gemini-client.js";

export class FakeGeminiClient implements GeminiClient {
  public generateContentCalls: { model: string; systemInstruction?: string; contents: GeminiContent[]; temperature?: number; maxOutputTokens?: number }[] = [];
  public embedContentCalls: { model: string; text: string }[] = [];

  constructor(private readonly responseText = "fake response") {}

  async generateContent(params: Parameters<GeminiClient["generateContent"]>[0]): Promise<{ text: string }> {
    this.generateContentCalls.push(params);
    return { text: this.responseText };
  }

  async embedContent(params: Parameters<GeminiClient["embedContent"]>[0]): Promise<{ values: number[] }> {
    this.embedContentCalls.push(params);
    // Deterministic, distinct-enough per input so the contract suite's equal-dimension check has something real to check.
    return { values: [params.text.length, params.text.length * 2, params.text.length * 3] };
  }
}
