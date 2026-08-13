export interface ConversationMessageLogEntry {
  sessionId: string;
  channel: string;
  agent: string;
  direction: "inbound" | "outbound";
  /** Message text only — never a channel's raw payload; PII redaction (Milestone 10) is the caller's job before this is called. */
  text?: string;
  occurredAt: string;
}

export interface BookingLogEntry {
  sessionId: string;
  bookingId: string;
  calendarId: string;
  start: string;
  end: string;
  createdAt: string;
}

/**
 * Persistence capability for conversation/booking audit records —
 * intentionally not a `core` interface: this is an operational/observability
 * concern the service-wiring layer performs around calls to `handleMessage`,
 * not something either agent takes as an input.
 */
export interface ConversationLogger {
  logMessage(entry: ConversationMessageLogEntry): Promise<void>;
  logBooking(entry: BookingLogEntry): Promise<void>;
}
