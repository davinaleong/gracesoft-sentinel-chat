import { timingSafeEqual } from "node:crypto";

/**
 * Verifies the `X-Telegram-Bot-Api-Secret-Token` header against the secret
 * configured when the webhook was registered (via `setWebhook`'s
 * `secret_token` param) — a static shared-secret header, not an HMAC
 * signature over the body like WhatsApp's.
 */
export function verifyTelegramSecretToken(receivedToken: string | undefined, expectedToken: string): boolean {
  if (!receivedToken) return false;

  const expected = Buffer.from(expectedToken, "utf8");
  const received = Buffer.from(receivedToken, "utf8");
  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}
