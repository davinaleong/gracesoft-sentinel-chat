import pino, { type Logger } from "pino";

export type { Logger };

/**
 * One structured-logging construction point, shared across every service —
 * the checklist explicitly calls out "shared logger package, not
 * duplicated" after the ad-hoc `console.error` calls scattered through
 * Milestone 8's `on-message.ts`/`webhook-router.ts` files. JSON output,
 * ISO timestamps, `service` on every line. Callers get per-session
 * traceability for free via the standard `logger.child({ sessionId })`.
 */
/** `destination` is an injection point for tests — production callers omit it and get stdout. */
export function createLogger(service: string, destination?: { write(chunk: string): void }): Logger {
  const options = {
    level: process.env.LOG_LEVEL ?? "info",
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  return destination ? pino(options, destination) : pino(options);
}
