import { describe, expect, it } from "vitest";
import { runAIProviderContractTests } from "@gracesoft-sentinel/core";
import { createGeminiProviderFromEnv, GeminiProvider } from "./gemini-provider.js";
import { FakeGeminiClient } from "./test-support.js";

function mockImageFetch(): typeof fetch {
  return (async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch;
}

runAIProviderContractTests(
  "GeminiProvider (fake client)",
  () => new GeminiProvider({ client: new FakeGeminiClient(), fetch: mockImageFetch() })
);

describe("GeminiProvider — request shaping", () => {
  it("chatComplete extracts system messages into systemInstruction and maps assistant -> model role", async () => {
    const client = new FakeGeminiClient();
    const provider = new GeminiProvider({ client });

    await provider.chatComplete({
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
        { role: "user", content: "How are you?" },
      ],
    });

    expect(client.generateContentCalls).toHaveLength(1);
    const call = client.generateContentCalls[0]!;
    expect(call.systemInstruction).toBe("Be concise.");
    expect(call.contents).toEqual([
      { role: "user", parts: [{ text: "Hi" }] },
      { role: "model", parts: [{ text: "Hello!" }] },
      { role: "user", parts: [{ text: "How are you?" }] },
    ]);
  });

  it("visionAnalyze sends inline base64 image data directly when given base64 input", async () => {
    const client = new FakeGeminiClient();
    const provider = new GeminiProvider({ client });

    await provider.visionAnalyze({ image: { base64: "ZmFrZQ==", mimeType: "image/png" }, prompt: "What dish is this?" });

    const call = client.generateContentCalls[0]!;
    expect(call.contents[0]!.parts).toEqual([
      { text: "What dish is this?" },
      { inlineData: { mimeType: "image/png", data: "ZmFrZQ==" } },
    ]);
  });

  it("visionAnalyze downloads and base64-encodes a {url} image before sending it", async () => {
    const client = new FakeGeminiClient();
    const provider = new GeminiProvider({ client, fetch: mockImageFetch() });

    await provider.visionAnalyze({ image: { url: "https://example.com/dish.jpg" } });

    const call = client.generateContentCalls[0]!;
    const imagePart = call.contents[0]!.parts[0] as { inlineData: { mimeType: string; data: string } };
    expect(imagePart.inlineData.mimeType).toBe("image/jpeg");
    expect(imagePart.inlineData.data).toBe(Buffer.from([1, 2, 3]).toString("base64"));
  });

  it("embed calls embedContent once per input and preserves order", async () => {
    const client = new FakeGeminiClient();
    const provider = new GeminiProvider({ client });

    const result = await provider.embed({ input: ["chicken rice", "laksa"] });

    expect(client.embedContentCalls.map((c) => c.text)).toEqual(["chicken rice", "laksa"]);
    expect(result.vectors).toHaveLength(2);
  });
});

describe("createGeminiProviderFromEnv", () => {
  it("constructs a provider from GEMINI_API_KEY", () => {
    const provider = createGeminiProviderFromEnv({ GEMINI_API_KEY: "test-key" } as NodeJS.ProcessEnv);
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it("throws a clear error when GEMINI_API_KEY is missing", () => {
    expect(() => createGeminiProviderFromEnv({} as NodeJS.ProcessEnv)).toThrow(/GEMINI_API_KEY/);
  });
});
