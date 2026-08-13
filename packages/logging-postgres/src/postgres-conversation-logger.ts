import type { BookingLogEntry, ConversationLogger, ConversationMessageLogEntry } from "./conversation-logger.js";
import { createPgClient, type PgLikeClient } from "./pg-client.js";

export interface PostgresConversationLoggerConfig {
  client: PgLikeClient;
}

/** `ConversationLogger` backed by Postgres — see `schema.sql` for the table shapes this writes to. */
export class PostgresConversationLogger implements ConversationLogger {
  private readonly client: PgLikeClient;

  constructor(config: PostgresConversationLoggerConfig) {
    this.client = config.client;
  }

  async logMessage(entry: ConversationMessageLogEntry): Promise<void> {
    await this.client.query(
      `INSERT INTO conversation_messages (session_id, channel, agent, direction, text, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.sessionId, entry.channel, entry.agent, entry.direction, entry.text ?? null, entry.occurredAt]
    );
  }

  async logBooking(entry: BookingLogEntry): Promise<void> {
    await this.client.query(
      `INSERT INTO bookings (session_id, booking_id, calendar_id, starts_at, ends_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.sessionId, entry.bookingId, entry.calendarId, entry.start, entry.end, entry.createdAt]
    );
  }
}

/** Config-driven construction from the process environment. */
export function createPostgresConversationLoggerFromEnv(env: NodeJS.ProcessEnv): PostgresConversationLogger {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing required env var: DATABASE_URL");
  return new PostgresConversationLogger({ client: createPgClient(connectionString) });
}
