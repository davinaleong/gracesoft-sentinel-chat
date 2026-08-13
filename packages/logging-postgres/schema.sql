-- Applied once against a fresh database (see docker-compose.yml, which
-- mounts this into Postgres's docker-entrypoint-initdb.d).

CREATE TABLE IF NOT EXISTS conversation_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  agent TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  -- Message text only — never the channel's raw payload. PII redaction
  -- (Milestone 10) applies before this is called, not in this schema.
  text TEXT,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS conversation_messages_session_id_idx ON conversation_messages (session_id);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS bookings_session_id_idx ON bookings (session_id);
