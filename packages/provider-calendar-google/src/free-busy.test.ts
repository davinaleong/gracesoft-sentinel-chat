import { describe, expect, it } from "vitest";
import { invertBusyToFree } from "./free-busy.js";

const FROM = "2026-05-04T09:00:00.000Z";
const TO = "2026-05-04T18:00:00.000Z";

describe("invertBusyToFree", () => {
  it("returns the whole range as free when there's no busy time", () => {
    const free = invertBusyToFree(FROM, TO, []);
    expect(free).toEqual([{ start: FROM, end: TO }]);
  });

  it("splits around a single busy block in the middle of the range", () => {
    const busyStart = "2026-05-04T12:00:00.000Z";
    const busyEnd = "2026-05-04T13:00:00.000Z";
    const free = invertBusyToFree(FROM, TO, [{ start: busyStart, end: busyEnd }]);
    expect(free).toEqual([
      { start: FROM, end: busyStart },
      { start: busyEnd, end: TO },
    ]);
  });

  it("handles multiple non-contiguous busy blocks, sorted or not", () => {
    const free = invertBusyToFree(FROM, TO, [
      { start: "2026-05-04T15:00:00.000Z", end: "2026-05-04T16:00:00.000Z" },
      { start: "2026-05-04T10:00:00.000Z", end: "2026-05-04T11:00:00.000Z" },
    ]);
    expect(free).toEqual([
      { start: FROM, end: "2026-05-04T10:00:00.000Z" },
      { start: "2026-05-04T11:00:00.000Z", end: "2026-05-04T15:00:00.000Z" },
      { start: "2026-05-04T16:00:00.000Z", end: TO },
    ]);
  });

  it("returns no free windows when a single busy block covers the entire range", () => {
    const free = invertBusyToFree(FROM, TO, [{ start: FROM, end: TO }]);
    expect(free).toEqual([]);
  });

  it("ignores malformed busy entries with a missing start or end", () => {
    const free = invertBusyToFree(FROM, TO, [{ start: null, end: "2026-05-04T13:00:00.000Z" }, { start: undefined, end: undefined }]);
    expect(free).toEqual([{ start: FROM, end: TO }]);
  });

  it("clips busy periods that extend outside the requested range", () => {
    const free = invertBusyToFree(FROM, TO, [{ start: "2026-05-04T05:00:00.000Z", end: "2026-05-04T10:00:00.000Z" }]);
    expect(free).toEqual([{ start: "2026-05-04T10:00:00.000Z", end: TO }]);
  });
});
