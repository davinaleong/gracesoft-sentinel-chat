import { describe, expect, it } from "vitest";
import type { AIProvider } from "./ai-provider.js";
import {
  ChatCompleteResultSchema,
  EmbedResultSchema,
  TranscribeAudioResultSchema,
  VisionAnalyzeResultSchema,
} from "./ai-provider.js";

/**
 * Shared contract test suite for `AIProvider` implementations. Intended to
 * run against a provider wired to a mocked HTTP layer — not live network
 * calls — so it's cheap enough to run in CI.
 *
 * Deliberately kept out of `ai-provider.ts` (and out of the package's main
 * entry point) — see `channel-adapter-contract.ts` for why. Import this
 * only from `@gracesoft-sentinel/core/testing`.
 */
export function runAIProviderContractTests(name: string, makeProvider: () => AIProvider | Promise<AIProvider>): void {
  describe(`AIProvider contract: ${name}`, () => {
    it("chatComplete returns non-empty text", async () => {
      const provider = await makeProvider();
      const result = await provider.chatComplete({
        messages: [{ role: "user", content: "Say hello in one word." }],
      });
      expect(ChatCompleteResultSchema.safeParse(result).success).toBe(true);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it("visionAnalyze returns non-empty text for an image", async () => {
      const provider = await makeProvider();
      const result = await provider.visionAnalyze({
        image: { url: "https://example.com/sample.jpg" },
        prompt: "What dish is this?",
      });
      expect(VisionAnalyzeResultSchema.safeParse(result).success).toBe(true);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it("embed returns one vector per input string, all of equal dimension", async () => {
      const provider = await makeProvider();
      const inputs = ["chicken rice", "laksa"];
      const result = await provider.embed({ input: inputs });
      expect(EmbedResultSchema.safeParse(result).success).toBe(true);
      expect(result.vectors).toHaveLength(inputs.length);
      const [firstDimension] = result.vectors.map((v) => v.length);
      for (const vector of result.vectors) {
        expect(vector.length).toBe(firstDimension);
        expect(vector.length).toBeGreaterThan(0);
      }
    });

    it("transcribeAudio returns non-empty text for an audio clip", async () => {
      const provider = await makeProvider();
      const result = await provider.transcribeAudio({ audio: { url: "https://example.com/voice-note.ogg" } });
      expect(TranscribeAudioResultSchema.safeParse(result).success).toBe(true);
      expect(result.text.length).toBeGreaterThan(0);
    });
  });
}
