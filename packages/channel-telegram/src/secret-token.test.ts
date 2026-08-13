import { describe, expect, it } from "vitest";
import { verifyTelegramSecretToken } from "./secret-token.js";

describe("verifyTelegramSecretToken", () => {
  it("accepts a matching token", () => {
    expect(verifyTelegramSecretToken("correct-token", "correct-token")).toBe(true);
  });

  it("rejects a non-matching token", () => {
    expect(verifyTelegramSecretToken("wrong-token", "correct-token")).toBe(false);
  });

  it("rejects a missing token", () => {
    expect(verifyTelegramSecretToken(undefined, "correct-token")).toBe(false);
  });

  it("rejects a token of different length without throwing", () => {
    expect(verifyTelegramSecretToken("short", "a-much-longer-expected-token")).toBe(false);
  });
});
