import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("agent-cook package skeleton", () => {
  it("resolves its own package name", () => {
    expect(PACKAGE_NAME).toBe("@gracesoft-sentinel/agent-cook");
  });
});
