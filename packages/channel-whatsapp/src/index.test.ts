import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("channel-whatsapp package skeleton", () => {
  it("resolves its own package name", () => {
    expect(PACKAGE_NAME).toBe("@gracesoft-sentinel/channel-whatsapp");
  });
});
