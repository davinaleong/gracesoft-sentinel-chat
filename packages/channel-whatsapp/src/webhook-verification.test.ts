import { describe, expect, it } from "vitest";
import { handleVerificationRequest } from "./webhook-verification.js";

const VERIFY_TOKEN = "test-verify-token";

describe("handleVerificationRequest", () => {
  it("echoes the challenge on a correct subscribe request", () => {
    const result = handleVerificationRequest(
      { "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "12345" },
      VERIFY_TOKEN
    );
    expect(result).toEqual({ status: 200, body: "12345" });
  });

  it("rejects when the verify token doesn't match", () => {
    const result = handleVerificationRequest(
      { "hub.mode": "subscribe", "hub.verify_token": "wrong-token", "hub.challenge": "12345" },
      VERIFY_TOKEN
    );
    expect(result.status).toBe(403);
  });

  it("rejects a non-subscribe mode", () => {
    const result = handleVerificationRequest(
      { "hub.mode": "unsubscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "12345" },
      VERIFY_TOKEN
    );
    expect(result.status).toBe(403);
  });

  it("rejects a request missing the challenge", () => {
    const result = handleVerificationRequest({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN }, VERIFY_TOKEN);
    expect(result.status).toBe(403);
  });
});
