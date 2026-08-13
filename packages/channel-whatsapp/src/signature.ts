import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

/**
 * Verifies the `X-Hub-Signature-256` header Meta sends on every webhook
 * POST — an HMAC-SHA256 of the raw request body, keyed by the app secret.
 * Requires the *raw* (unparsed) body, since re-serialized JSON won't
 * byte-for-byte match what was signed.
 */
export function verifyWhatsAppSignature(rawBody: Buffer | string, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice(SIGNATURE_PREFIX.length);

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
