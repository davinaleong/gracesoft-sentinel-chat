import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("provider-calendar-google package skeleton", () => {
  it("resolves its own package name", () => {
    expect(PACKAGE_NAME).toBe("@gracesoft-sentinel/provider-calendar-google");
  });
});
