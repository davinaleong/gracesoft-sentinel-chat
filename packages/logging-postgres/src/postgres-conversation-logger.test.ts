import { describe, expect, it } from "vitest";
import { PostgresConversationLogger, createPostgresConversationLoggerFromEnv } from "./postgres-conversation-logger.js";
import type { PgLikeClient } from "./pg-client.js";

class FakePgClient implements PgLikeClient {
  public queries: { text: string; params: unknown[] }[] = [];

  async query(text: string, params: unknown[]): Promise<{ rows: unknown[] }> {
    this.queries.push({ text, params });
    return { rows: [] };
  }
}

describe("PostgresConversationLogger.logMessage", () => {
  it("inserts into conversation_messages with the expected column order", async () => {
    const client = new FakePgClient();
    const logger = new PostgresConversationLogger({ client });

    await logger.logMessage({
      sessionId: "sess-1",
      channel: "whatsapp",
      agent: "concierge",
      direction: "inbound",
      text: "book something",
      occurredAt: "2026-05-01T02:00:00.000Z",
    });

    expect(client.queries).toHaveLength(1);
    expect(client.queries[0]!.text).toContain("INSERT INTO conversation_messages");
    expect(client.queries[0]!.params).toEqual(["sess-1", "whatsapp", "concierge", "inbound", "book something", "2026-05-01T02:00:00.000Z"]);
  });

  it("logs a null text rather than throwing when text is absent (e.g. a media-only message)", async () => {
    const client = new FakePgClient();
    const logger = new PostgresConversationLogger({ client });

    await logger.logMessage({
      sessionId: "sess-1",
      channel: "whatsapp",
      agent: "cook",
      direction: "inbound",
      occurredAt: "2026-05-01T02:00:00.000Z",
    });

    expect(client.queries[0]!.params[4]).toBeNull();
  });
});

describe("PostgresConversationLogger.logBooking", () => {
  it("inserts into bookings with the expected column order", async () => {
    const client = new FakePgClient();
    const logger = new PostgresConversationLogger({ client });

    await logger.logBooking({
      sessionId: "sess-1",
      bookingId: "booking-1",
      calendarId: "test-calendar",
      start: "2026-05-04T01:00:00.000Z",
      end: "2026-05-04T01:30:00.000Z",
      createdAt: "2026-05-01T02:00:00.000Z",
    });

    expect(client.queries).toHaveLength(1);
    expect(client.queries[0]!.text).toContain("INSERT INTO bookings");
    expect(client.queries[0]!.params).toEqual([
      "sess-1",
      "booking-1",
      "test-calendar",
      "2026-05-04T01:00:00.000Z",
      "2026-05-04T01:30:00.000Z",
      "2026-05-01T02:00:00.000Z",
    ]);
  });
});

describe("createPostgresConversationLoggerFromEnv", () => {
  it("throws a clear error when DATABASE_URL is missing", () => {
    expect(() => createPostgresConversationLoggerFromEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });

  it("constructs a logger when DATABASE_URL is present", () => {
    const logger = createPostgresConversationLoggerFromEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
    } as NodeJS.ProcessEnv);
    expect(logger).toBeInstanceOf(PostgresConversationLogger);
  });
});
