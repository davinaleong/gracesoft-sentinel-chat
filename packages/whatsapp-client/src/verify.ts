import * as crypto from "crypto";

/**
 * Verifies the X-Hub-Signature-256 header sent by the WhatsApp Cloud API.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param rawBody  - The raw, unparsed request body (Buffer or string).
 * @param signatureHeader - The full header value, e.g. "sha256=abc123...".
 * @param appSecret - Your Meta App Secret.
 * @returns true if the signature is valid, false otherwise.
 */
export function verifySignature(
  rawBody: Buffer | string,
  signatureHeader: string,
  appSecret: string
): boolean {
  const eqIdx = signatureHeader.indexOf("=");
  if (eqIdx === -1) return false;

  const prefix = signatureHeader.slice(0, eqIdx);
  const receivedHex = signatureHeader.slice(eqIdx + 1);

  if (prefix !== "sha256" || !receivedHex) return false;

  const expectedHex = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  // Buffers must be the same length for timingSafeEqual
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");

  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(expected, received);
}
