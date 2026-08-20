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

export const TranscribeAudioInputSchema = z.object({
  audio: z.union([
    z.object({ url: z.string() }),
    z.object({ base64: z.string(), mimeType: z.string() }),
  ]),
  /** BCP-47 language hint, e.g. "en" — providers may use this to improve accuracy. */
  language: z.string().optional(),
});
export type TranscribeAudioInput = z.infer<typeof TranscribeAudioInputSchema>;

export const TranscribeAudioResultSchema = z.object({
  text: z.string(),
  raw: z.unknown().optional(),
});
export type TranscribeAudioResult = z.infer<typeof TranscribeAudioResultSchema>;

/**
 * Provider-agnostic AI capability surface. Agents depend on this interface
 * only — never on a concrete SDK (OpenAI, Anthropic, etc).
 */
export interface AIProvider {
  chatComplete(input: ChatCompleteInput): Promise<ChatCompleteResult>;
  visionAnalyze(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult>;
  embed(input: EmbedInput): Promise<EmbedResult>;
  transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResult>;
}
