/**
 * Deterministic, rule-based dietary-adjustment detection — not an LLM call,
 * so it's free, fast, and trivially unit-testable. Only relevant once a
 * recipe already exists in context; `handleMessage` gates on that.
 */
const DIETARY_KEYWORDS = [
  "vegetarian",
  "vegan",
  "gluten.?free",
  "dairy.?free",
  "lactose.?free",
  "halal",
  "kosher",
  "nut.?free",
  "low.?carb",
  "no meat",
  "no dairy",
  "no nuts",
  "pescatarian",
];

const DIETARY_PATTERN = new RegExp(`\\b(${DIETARY_KEYWORDS.join("|")})\\b`, "i");

export function isDietaryAdjustmentRequest(text: string): boolean {
  return DIETARY_PATTERN.test(text);
}
