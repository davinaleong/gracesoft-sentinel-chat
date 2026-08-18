import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTwilioSignature } from "./signature.js";

const AUTH_TOKEN = "test-auth-token";
const URL = "https://example.com/webhook";

function sign(url: string, params: Record<string, string>): string {
  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }
  return createHmac("sha1", AUTH_TOKEN).update(data, "utf8").digest("base64");
}

describe("verifyTwilioSignature", () => {
  it("accepts a correctly signed request", () => {
    const params = { From: "+15551234567", Body: "hi", MessageSid: "SM123" };
    expect(verifyTwilioSignature(URL, params, sign(URL, params), AUTH_TOKEN)).toBe(true);
  });

  it("rejects a signature computed with different params", () => {
    const params = { From: "+15551234567", Body: "hi", MessageSid: "SM123" };
    const tamperedParams = { ...params, Body: "mallory" };
    expect(verifyTwilioSignature(URL, tamperedParams, sign(URL, params), AUTH_TOKEN)).toBe(false);
  });

  it("rejects a signature computed with the wrong auth token", () => {
    const params = { From: "+15551234567", Body: "hi" };
    const wrongTokenSig = createHmac("sha1", "wrong-token")
      .update(URL + "Body" + "hi" + "From" + "+15551234567", "utf8")
      .digest("base64");
    expect(verifyTwilioSignature(URL, params, wrongTokenSig, AUTH_TOKEN)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyTwilioSignature(URL, {}, undefined, AUTH_TOKEN)).toBe(false);
  });

  it("rejects a malformed (non-base64) signature header without throwing", () => {
    expect(verifyTwilioSignature(URL, {}, "not-valid-base64!!!", AUTH_TOKEN)).toBe(false);
  });

  it("is sensitive to the webhook URL itself", () => {
    const params = { Body: "hi" };
    expect(verifyTwilioSignature("https://example.com/different-path", params, sign(URL, params), AUTH_TOKEN)).toBe(false);
  });
});
