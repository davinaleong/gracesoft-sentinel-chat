import type {
  AIProvider,
  AvailabilitySlot,
  Booking,
  BusinessConfig,
  BusinessHours,
  CalendarProvider,
  ChatCompleteInput,
  ChatCompleteResult,
  CreateBookingInput,
  EmbedInput,
  EmbedResult,
  GetAvailabilityInput,
  GetBusinessHoursInput,
  TranscribeAudioInput,
  TranscribeAudioResult,
  VisionAnalyzeInput,
  VisionAnalyzeResult,
} from "@gracesoft-sentinel/core";
import type { FaqGroundingBlueprint } from "./faq-matcher.js";

/**
 * Mirrors the `testing.md` regression scenario: Mon-Fri 09:00-18:00,
 * Sat 09:00-13:00, Sun closed, with 2 May carved out as a public-holiday
 * exception so the weekly Saturday hours never apply to it.
 */
export const TEST_BUSINESS_HOURS: BusinessHours = {
  timezone: "Asia/Singapore",
  weekly: {
    mon: { open: "09:00", close: "18:00" },
    tue: { open: "09:00", close: "18:00" },
    wed: { open: "09:00", close: "18:00" },
    thu: { open: "09:00", close: "18:00" },
    fri: { open: "09:00", close: "18:00" },
    sat: { open: "09:00", close: "13:00" },
    sun: null,
  },
  exceptions: [{ date: "2026-05-02", hours: null, reason: "Public holiday" }],
};

export const TEST_BUSINESS_CONFIG: BusinessConfig = {
  businessId: "test-biz",
  timezone: "Asia/Singapore",
  faqBlueprintPath: "./fixtures/faq.json",
  calendarId: "test-calendar",
  businessHours: TEST_BUSINESS_HOURS,
};

export const TEST_FAQ_BLUEPRINT: FaqGroundingBlueprint = {
  system_prompt: "You are the Test Business Assistant, answering questions about Test Business.",
  ai_disclosure: {
    required: true,
    opening_message: "Hi, I'm the Test Business Assistant — an AI, not a human.",
    if_asked_directly: "Confirm directly that you're an AI, never imply otherwise.",
  },
  knowledge_base: {
    hours: "Monday to Friday 9am-6pm, Saturday 9am-1pm.",
    location: "123 Example Street, Singapore.",
  },
  guardrails: ["Never state pricing — none is published.", "Never invent facts not in knowledge_base."],
  escalation_policy: {
    conditions: ["The chatter explicitly asks for a human.", "The question can't be answered from knowledge_base."],
    handoff_instruction: "Give them the contact email when handing off.",
    example_handoff_response: "Let me connect you with the team: hello@example.com",
  },
  example_exchanges: [{ user: "hi", assistant: "Hello! How can I help you today?" }],
};

class FakeAiProvider implements AIProvider {
  public calls: ChatCompleteInput[] = [];
  public transcribeAudioCalls: TranscribeAudioInput[] = [];

  constructor(
    private readonly makeResult: (input: ChatCompleteInput) => ChatCompleteResult,
    private readonly makeTranscription?: (input: TranscribeAudioInput) => TranscribeAudioResult
  ) {}

  async chatComplete(input: ChatCompleteInput): Promise<ChatCompleteResult> {
    this.calls.push(input);
    return this.makeResult(input);
  }

  async visionAnalyze(_input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    throw new Error("FakeAiProvider.visionAnalyze is not implemented — not needed by these tests");
  }

  async embed(_input: EmbedInput): Promise<EmbedResult> {
    throw new Error("FakeAiProvider.embed is not implemented — not needed by these tests");
  }

  async transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
    this.transcribeAudioCalls.push(input);
    if (!this.makeTranscription) {
      throw new Error("FakeAiProvider.transcribeAudio is not configured — pass makeTranscription to use it");
    }
    return this.makeTranscription(input);
  }
}

export type { FakeAiProvider };

/** An AI provider fake that always returns the same well-formed JSON answer. */
export function fakeAiProviderAnswering(answer: string, escalate = false): FakeAiProvider {
  return new FakeAiProvider(() => ({ text: JSON.stringify({ answer, escalate }) }));
}

/** An AI provider fake driven by a callback, for asserting on the prompt it was sent. */
export function fakeAiProviderWith(makeResult: (input: ChatCompleteInput) => ChatCompleteResult): FakeAiProvider {
  return new FakeAiProvider(makeResult);
}

/** An AI provider fake that transcribes any voice note to a fixed string, and otherwise answers FAQ questions normally. */
export function fakeAiProviderWithTranscription(transcribedText: string, faqAnswer = "unused", escalate = false): FakeAiProvider {
  return new FakeAiProvider(
    () => ({ text: JSON.stringify({ answer: faqAnswer, escalate }) }),
    () => ({ text: transcribedText })
  );
}

class RecordingCalendarProvider implements CalendarProvider {
  public createBookingCalls: CreateBookingInput[] = [];
  private nextId = 1;

  constructor(
    private readonly busyWindows: { start: string; end: string }[] = [],
    private readonly businessHours: BusinessHours = TEST_BUSINESS_HOURS
  ) {}

  async getAvailability(input: GetAvailabilityInput): Promise<AvailabilitySlot[]> {
    const from = new Date(input.from).getTime();
    const to = new Date(input.to).getTime();
    if (from >= to) return [];

    const busyInRange = this.busyWindows
      .map((w) => ({ start: new Date(w.start).getTime(), end: new Date(w.end).getTime() }))
      .filter((w) => w.end > from && w.start < to)
      .sort((a, b) => a.start - b.start);

    const free: AvailabilitySlot[] = [];
    let cursor = from;
    for (const busy of busyInRange) {
      if (busy.start > cursor) {
        free.push({ start: new Date(cursor).toISOString(), end: new Date(busy.start).toISOString() });
      }
      cursor = Math.max(cursor, busy.end);
    }
    if (cursor < to) {
      free.push({ start: new Date(cursor).toISOString(), end: new Date(to).toISOString() });
    }
    return free;
  }

  async createBooking(input: CreateBookingInput): Promise<Booking> {
    this.createBookingCalls.push(input);
    return { id: `booking-${this.nextId++}`, start: input.start, end: input.end };
  }

  async getBusinessHours(_input: GetBusinessHoursInput): Promise<BusinessHours> {
    return this.businessHours;
  }
}

/** A calendar with no bookings on it at all — every business-hours slot is free. */
export function fullyAvailableCalendarProvider(): RecordingCalendarProvider {
  return new RecordingCalendarProvider([]);
}

/** A calendar that's busy for the given ISO windows, free everywhere else. */
export function calendarWithBusyWindows(
  busyWindows: { start: string; end: string }[]
): RecordingCalendarProvider {
  return new RecordingCalendarProvider(busyWindows);
}

export type { RecordingCalendarProvider };
