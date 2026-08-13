import { describe, expect, it } from "vitest";
import { runAIProviderContractTests } from "@gracesoft-sentinel/core";
import { createOpenAIProviderFromEnv, OpenAIProvider, type OpenAIProviderConfig } from "./openai-provider.js";

/**
 * A fetch stub standing in for OpenAI's HTTP API — the contract suite must
 * never make live network calls. Routes purely on the request path so it
 * stays agnostic to whichever SDK internals construct the URL.
 */
function mockOpenAiFetch(): NonNullable<OpenAIProviderConfig["fetch"]> {
  // The openai SDK's Node type shims assume a `node-fetch`-shaped Response;
  // Node's native global Response (used here) is structurally close but not
  // identical, so the cast below is a test-only affordance, not a runtime concern.
  const impl = async (input: unknown) => {
    const url = String(input);

    if (url.includes("/embeddings")) {
      return new Response(
        JSON.stringify({
          data: [
            { embedding: [0.1, 0.2, 0.3], index: 0 },
            { embedding: [0.4, 0.5, 0.6], index: 1 },
          ],
          model: "text-embedding-3-small",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    // Chat completions endpoint — covers both chatComplete and visionAnalyze.
    return new Response(
      JSON.stringify({
        id: "chatcmpl-test",
        object: "chat.completion",
        model: "gpt-4o",
        choices: [{ index: 0, message: { role: "assistant", content: "Hello!" }, finish_reason: "stop" }],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  return impl as unknown as NonNullable<OpenAIProviderConfig["fetch"]>;
}

runAIProviderContractTests(
  "OpenAIProvider (mocked HTTP)",
  () => new OpenAIProvider({ apiKey: "test-key", fetch: mockOpenAiFetch() })
);

describe("OpenAIProvider — request shaping", () => {
  it("chatComplete parses the response text from the mocked completion", async () => {
    const provider = new OpenAIProvider({ apiKey: "test-key", fetch: mockOpenAiFetch() });
    const result = await provider.chatComplete({ messages: [{ role: "user", content: "hi" }] });
    expect(result.text).toBe("Hello!");
  });

  it("embed returns one vector per requested input", async () => {
    const provider = new OpenAIProvider({ apiKey: "test-key", fetch: mockOpenAiFetch() });
    const result = await provider.embed({ input: ["a", "b"] });
    expect(result.vectors).toHaveLength(2);
  });
});

describe("createOpenAIProviderFromEnv", () => {
  it("constructs a provider from OPENAI_API_KEY", () => {
    const provider = createOpenAIProviderFromEnv({ OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv);
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it("throws a clear error when OPENAI_API_KEY is missing", () => {
    expect(() => createOpenAIProviderFromEnv({} as NodeJS.ProcessEnv)).toThrow(/OPENAI_API_KEY/);
  });
});
