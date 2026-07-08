type LogLevel = "info" | "warn" | "error";

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Creates a simple structured (JSON) logger.
 * Output is suitable for log aggregation (e.g. Datadog, CloudWatch).
 */
export function createLogger(name: string): Logger {
  function log(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    const entry = {
      level,
      name,
      message,
      timestamp: new Date().toISOString(),
      ...(meta ?? {}),
    };
    // Use console.error for warn/error so they reach stderr
    if (level === "info") {
      console.log(JSON.stringify(entry));
    } else {
      console.error(JSON.stringify(entry));
    }
  }

  return {
    info: (msg, meta) => log("info", msg, meta),
    warn: (msg, meta) => log("warn", msg, meta),
    error: (msg, meta) => log("error", msg, meta),
  };
}
