import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWhatsAppSignature } from "./signature.js";

const APP_SECRET = "test-app-secret";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;
}

describe("verifyWhatsAppSignature", () => {
  it("accepts a correctly signed body", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyWhatsAppSignature(body, sign(body), APP_SECRET)).toBe(true);
  });

  it("rejects a body that doesn't match the signature", () => {
    const body = JSON.stringify({ hello: "world" });
    const tamperedBody = JSON.stringify({ hello: "mallory" });
    expect(verifyWhatsAppSignature(tamperedBody, sign(body), APP_SECRET)).toBe(false);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const body = JSON.stringify({ hello: "world" });
    const wrongSecretSignature = `sha256=${createHmac("sha256", "wrong-secret").update(body).digest("hex")}`;
    expect(verifyWhatsAppSignature(body, wrongSecretSignature, APP_SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWhatsAppSignature("body", undefined, APP_SECRET)).toBe(false);
  });

  it("rejects a header without the sha256= prefix", () => {
    expect(verifyWhatsAppSignature("body", "deadbeef", APP_SECRET)).toBe(false);
  });

  it("works against a raw Buffer body, not just a string", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }));
    expect(verifyWhatsAppSignature(body, sign(body.toString()), APP_SECRET)).toBe(true);
  });
});
