import { describe, expect, it } from "vitest";
import { z } from "zod";

export const ChatRoleSchema = z.enum(["system", "user", "assistant"]);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatCompleteInputSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
});
export type ChatCompleteInput = z.infer<typeof ChatCompleteInputSchema>;

export const ChatCompleteResultSchema = z.object({
  text: z.string(),
  raw: z.unknown().optional(),
});
export type ChatCompleteResult = z.infer<typeof ChatCompleteResultSchema>;

export const VisionAnalyzeInputSchema = z.object({
  image: z.union([
    z.object({ url: z.string() }),
    z.object({ base64: z.string(), mimeType: z.string() }),
  ]),
  prompt: z.string().optional(),
});
export type VisionAnalyzeInput = z.infer<typeof VisionAnalyzeInputSchema>;

export const VisionAnalyzeResultSchema = z.object({
  text: z.string(),
  raw: z.unknown().optional(),
});
export type VisionAnalyzeResult = z.infer<typeof VisionAnalyzeResultSchema>;

export const EmbedInputSchema = z.object({
  input: z.union([z.string(), z.array(z.string()).min(1)]),
});
export type EmbedInput = z.infer<typeof EmbedInputSchema>;

export const EmbedResultSchema = z.object({
  vectors: z.array(z.array(z.number())).min(1),
});
export type EmbedResult = z.infer<typeof EmbedResultSchema>;

/**
 * Provider-agnostic AI capability surface. Agents depend on this interface
 * only — never on a concrete SDK (OpenAI, Anthropic, etc).
 */
export interface AIProvider {
  chatComplete(input: ChatCompleteInput): Promise<ChatCompleteResult>;
  visionAnalyze(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult>;
  embed(input: EmbedInput): Promise<EmbedResult>;
}

/**
 * Shared contract test suite for `AIProvider` implementations. Intended to
 * run against a provider wired to a mocked HTTP layer — not live network
 * calls — so it's cheap enough to run in CI.
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
  });
}
