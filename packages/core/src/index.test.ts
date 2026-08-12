import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("core package skeleton", () => {
  it("resolves its own package name", () => {
    expect(PACKAGE_NAME).toBe("@gracesoft-sentinel/core");
  });
});
