import { describe, expect, it } from "vitest";
import { extractAppointmentId, generateAppointmentId } from "./appointment-id.js";

describe("generateAppointmentId", () => {
  it("produces a GS-XXXX-XXXX shaped id using only unambiguous characters", () => {
    const id = generateAppointmentId();
    expect(id).toMatch(/^GS-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(id).not.toMatch(/[ILOU]/); // Crockford exclusions
  });

  it("generates distinct ids across many calls", () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateAppointmentId()));
    expect(ids.size).toBe(200);
  });
});

describe("extractAppointmentId", () => {
  it("finds an appointment id embedded in a longer sentence", () => {
    expect(extractAppointmentId("my appointment id is GS-4F7K-2Q9X, can you check it?")).toBe("GS-4F7K-2Q9X");
  });

  it("is case-insensitive and normalizes to uppercase", () => {
    expect(extractAppointmentId("it's gs-4f7k-2q9x")).toBe("GS-4F7K-2Q9X");
  });

  it("returns undefined when no appointment id is present", () => {
    expect(extractAppointmentId("I want to reschedule my booking")).toBeUndefined();
  });

  it("does not match a malformed id (wrong group length)", () => {
    expect(extractAppointmentId("GS-4F7-2Q9X")).toBeUndefined();
  });
});
