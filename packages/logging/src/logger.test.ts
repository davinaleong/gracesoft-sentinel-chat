import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

class CapturingStream {
  public lines: string[] = [];
  write(chunk: string): void {
    this.lines.push(chunk);
  }
}

function parseLines(stream: CapturingStream): Record<string, unknown>[] {
  return stream.lines.filter((line) => line.trim().length > 0).map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("createLogger", () => {
  it("emits structured JSON with the service name, level, message, and an ISO timestamp", () => {
    const stream = new CapturingStream();
    const logger = createLogger("concierge-service", stream);
    logger.info("handled inbound message");

    const [entry] = parseLines(stream);
    expect(entry).toMatchObject({ service: "concierge-service", level: 30, msg: "handled inbound message" });
    expect(typeof entry!.time).toBe("string");
    expect(new Date(entry!.time as string).toString()).not.toBe("Invalid Date");
  });

  it("includes arbitrary structured fields passed alongside the message", () => {
    const stream = new CapturingStream();
    const logger = createLogger("cook-service", stream);
    logger.error({ err: "boom" }, "createBooking failed");

    const [entry] = parseLines(stream);
    expect(entry).toMatchObject({ msg: "createBooking failed", err: "boom" });
  });

  it("supports child loggers for per-session traceability", () => {
    const stream = new CapturingStream();
    const logger = createLogger("concierge-service", stream);
    const sessionLogger = logger.child({ sessionId: "concierge:whatsapp:6591234567" });
    sessionLogger.info("session loaded");

    const [entry] = parseLines(stream);
    expect(entry).toMatchObject({ sessionId: "concierge:whatsapp:6591234567", msg: "session loaded" });
  });
});
