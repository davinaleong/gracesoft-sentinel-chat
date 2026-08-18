import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Twilio's `X-Twilio-Signature` header: HMAC-SHA1 of the full
 * webhook URL with each POST parameter's key+value appended (sorted by key,
 * no separators), keyed by the account's auth token, base64-encoded.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string | undefined>,
  signatureHeader: string | undefined,
  authToken: string
): boolean {
  if (!signatureHeader) return false;

  let data = url;
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value !== undefined) data += key + value;
  }

  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");

  let expectedBuf: Buffer;
  let providedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expected, "base64");
    providedBuf = Buffer.from(signatureHeader, "base64");
  } catch {
    return false;
  }
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
