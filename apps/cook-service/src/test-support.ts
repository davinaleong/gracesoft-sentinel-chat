import type {
  AIProvider,
  ChatCompleteInput,
  ChatCompleteResult,
  ConversationState,
  EmbedInput,
  EmbedResult,
  SessionStore,
  TranscribeAudioInput,
  TranscribeAudioResult,
  VisionAnalyzeInput,
  VisionAnalyzeResult,
} from "@gracesoft-sentinel/core";
import type { BookingLogEntry, ConversationLogger, ConversationMessageLogEntry } from "@gracesoft-sentinel/logging-postgres";
import { createLogger, type Logger } from "@gracesoft-sentinel/logging";

/** A working structured logger that writes nowhere — keeps test output clean without stubbing the whole interface. */
export function createSilentTestLogger(): Logger {
  return createLogger("test", { write: () => {} });
}

export class FakeAiProvider implements AIProvider {
  constructor(
    private readonly chatText = JSON.stringify({
      dishName: "Chicken Rice",
      servings: 2,
      ingredients: ["chicken", "rice"],
      steps: ["cook"],
      substitutions: [],
      servingSuggestions: [],
      nutrition: { calories: 500, protein: "30g", carbohydrates: "60g", fat: "12g", fiber: "2g" },
    }),
    private readonly visionText = JSON.stringify({ dishName: "Chicken Rice" })
  ) {}

  async chatComplete(_input: ChatCompleteInput): Promise<ChatCompleteResult> {
    return { text: this.chatText };
  }
  async visionAnalyze(_input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    return { text: this.visionText };
  }
  async embed(_input: EmbedInput): Promise<EmbedResult> {
    return { vectors: [[0, 0, 0]] };
  }
  async transcribeAudio(_input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
    return { text: "fake transcription" };
  }
}

export class FakeSessionStore implements SessionStore {
  private readonly sessions = new Map<string, ConversationState>();
  public setCalls: { state: ConversationState; ttlSeconds?: number }[] = [];

  async get(sessionId: string): Promise<ConversationState | null> {
    return this.sessions.get(sessionId) ?? null;
  }
  async set(state: ConversationState, ttlSeconds?: number): Promise<void> {
    this.setCalls.push({ state, ttlSeconds });
    this.sessions.set(state.sessionId, state);
  }
  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

export class FakeConversationLogger implements ConversationLogger {
  public messages: ConversationMessageLogEntry[] = [];
  public bookings: BookingLogEntry[] = [];

  async logMessage(entry: ConversationMessageLogEntry): Promise<void> {
    this.messages.push(entry);
  }
  async logBooking(entry: BookingLogEntry): Promise<void> {
    this.bookings.push(entry);
  }
}
