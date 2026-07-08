import * as crypto from "crypto";

/**
 * Verifies the X-Telegram-Bot-Api-Secret-Token header value.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param receivedToken - Value of the X-Telegram-Bot-Api-Secret-Token header (may be undefined).
 * @param expectedToken - The secret token you registered via setWebhook.
 * @returns true if the token matches, false otherwise.
 */
export function verifySecretToken(
  receivedToken: string | undefined,
  expectedToken: string
): boolean {
  if (!receivedToken) return false;

  // Tokens must be 1-256 characters (ASCII printable, no whitespace)
  const expected = Buffer.from(expectedToken, "utf8");
  const received = Buffer.from(receivedToken, "utf8");

  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(expected, received);
}
