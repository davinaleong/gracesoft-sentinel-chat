import { runAIProviderContractTests } from "@gracesoft-sentinel/core";
import type {
  AIProvider,
  ChatCompleteInput,
  ChatCompleteResult,
  EmbedInput,
  EmbedResult,
  TranscribeAudioInput,
  TranscribeAudioResult,
  VisionAnalyzeInput,
  VisionAnalyzeResult,
} from "@gracesoft-sentinel/core";

/**
 * (Stretch, Milestone 4) A wholly non-OpenAI-shaped `AIProvider` — no HTTP,
 * no SDK, no concept of "model" or "response_format". Running the same
 * shared contract suite against this proves `AIProvider` genuinely
 * generalises rather than being OpenAI's API surface in disguise.
 */
class EchoAiProvider implements AIProvider {
  async chatComplete(input: ChatCompleteInput): Promise<ChatCompleteResult> {
    const lastUserMessage = [...input.messages].reverse().find((m) => m.role === "user");
    return { text: `echo: ${lastUserMessage?.content ?? ""}` };
  }

  async visionAnalyze(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    return { text: `saw an image${input.prompt ? ` (${input.prompt})` : ""}` };
  }

  async embed(input: EmbedInput): Promise<EmbedResult> {
    const inputs = Array.isArray(input.input) ? input.input : [input.input];
    // Deterministic, trivially-computed "vectors" — dimension doesn't need
    // to mean anything, only to be consistent across the batch.
    return { vectors: inputs.map((text) => [text.length, text.length * 2, text.length * 3]) };
  }

  async transcribeAudio(_input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
    return { text: "this is a fake transcription" };
  }
}

runAIProviderContractTests("EchoAiProvider (stub, non-OpenAI-shaped)", () => new EchoAiProvider());
