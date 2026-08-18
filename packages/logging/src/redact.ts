const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Phone-shaped runs: a leading digit/plus, then digits/spaces/dashes/parens, ending in a digit.
// Only redacted if it actually contains 7+ digits, so short numbers ("slot 2", "3", order #123")
// used elsewhere in normal conversation aren't over-redacted.
const PHONE_CANDIDATE_PATTERN = /\+?\d[\d\s\-()]{5,}\d/g;

/**
 * Best-effort PII redaction applied to message text before it's logged —
 * conversation/booking logs (Milestone 8) capture text, so this is what
 * keeps that text from carrying a chatter's email or phone number verbatim
 * into Postgres. Not a substitute for not logging raw channel payloads in
 * the first place (already true, see `logging-postgres`), and not a
 * guarantee every possible PII shape is caught — it's a floor, not a
 * ceiling.
 */
export function redactPii(text: string): string {
  return text.replace(EMAIL_PATTERN, "[redacted-email]").replace(PHONE_CANDIDATE_PATTERN, (match) => {
    const digitCount = (match.match(/\d/g) ?? []).length;
    return digitCount >= 7 ? "[redacted-phone]" : match;
  });
}
