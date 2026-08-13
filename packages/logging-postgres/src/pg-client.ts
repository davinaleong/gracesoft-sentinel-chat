import { Pool } from "pg";

/**
 * The minimal slice of a Postgres client `PostgresConversationLogger`
 * actually calls — kept as our own small interface so tests can substitute
 * an in-memory fake without a real database.
 */
export interface PgLikeClient {
  query(text: string, params: unknown[]): Promise<{ rows: unknown[] }>;
}

/** Builds the real `pg` connection pool from a connection URL. */
export function createPgClient(connectionString: string): PgLikeClient {
  return new Pool({ connectionString });
}
