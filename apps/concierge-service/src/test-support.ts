import type {
  AIProvider,
  AvailabilitySlot,
  Booking,
  BusinessHours,
  CalendarProvider,
  ChatCompleteInput,
  ChatCompleteResult,
  ConversationState,
  CreateBookingInput,
  EmbedInput,
  EmbedResult,
  FindBookingByAppointmentIdInput,
  GetAvailabilityInput,
  GetBusinessHoursInput,
  SessionStore,
  TranscribeAudioInput,
  TranscribeAudioResult,
  UpdateBookingInput,
  VisionAnalyzeInput,
  VisionAnalyzeResult,
} from "@gracesoft-sentinel/core";
import type { BookingLogEntry, ConversationLogger, ConversationMessageLogEntry } from "@gracesoft-sentinel/logging-postgres";
import { createLogger, type Logger } from "@gracesoft-sentinel/logging";

/** A working structured logger that writes nowhere — keeps test output clean without stubbing the whole interface. */
export function createSilentTestLogger(): Logger {
  return createLogger("test", { write: () => {} });
}

export class FakeCalendarProvider implements CalendarProvider {
  public createBookingCalls: CreateBookingInput[] = [];
  private nextId = 1;
  private readonly bookingsById = new Map<string, Booking>();

  async getAvailability(input: GetAvailabilityInput): Promise<AvailabilitySlot[]> {
    return [{ start: input.from, end: input.to }];
  }
  async createBooking(input: CreateBookingInput): Promise<Booking> {
    this.createBookingCalls.push(input);
    const booking: Booking = { id: `booking-${this.nextId++}`, appointmentId: input.appointmentId, start: input.start, end: input.end };
    this.bookingsById.set(booking.id, booking);
    return booking;
  }
  async findBookingByAppointmentId(input: FindBookingByAppointmentIdInput): Promise<Booking | null> {
    for (const booking of this.bookingsById.values()) {
      if (booking.appointmentId === input.appointmentId) return booking;
    }
    return null;
  }
  async updateBooking(input: UpdateBookingInput): Promise<Booking> {
    const existing = this.bookingsById.get(input.id);
    if (!existing) throw new Error(`No booking with id ${input.id}`);
    const updated: Booking = { ...existing, start: input.start, end: input.end };
    this.bookingsById.set(updated.id, updated);
    return updated;
  }
  async getBusinessHours(_input: GetBusinessHoursInput): Promise<BusinessHours> {
    return {
      timezone: "Asia/Singapore",
      weekly: { mon: { open: "09:00", close: "18:00" }, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
      exceptions: [],
    };
  }
}

export class FakeAiProvider implements AIProvider {
  async chatComplete(_input: ChatCompleteInput): Promise<ChatCompleteResult> {
    return { text: JSON.stringify({ answer: "fake answer", escalate: false }) };
  }
  async visionAnalyze(_input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    return { text: "fake vision result" };
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
