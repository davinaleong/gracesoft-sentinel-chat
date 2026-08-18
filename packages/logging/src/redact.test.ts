import { describe, expect, it } from "vitest";
import { redactPii } from "./redact.js";

describe("redactPii", () => {
  it("redacts an email address", () => {
    expect(redactPii("My email is alex.tan@example.com, reach me there")).toBe(
      "My email is [redacted-email], reach me there"
    );
  });

  it("redacts a phone number with spaces", () => {
    expect(redactPii("Call me at +65 9123 4567 please")).toBe("Call me at [redacted-phone] please");
  });

  it("redacts a phone number with dashes", () => {
    expect(redactPii("My number is 9123-4567")).toBe("My number is [redacted-phone]");
  });

  it("redacts multiple PII instances in the same text", () => {
    expect(redactPii("Email alex@example.com or call 91234567")).toBe(
      "Email [redacted-email] or call [redacted-phone]"
    );
  });

  it("does not redact short numbers like a slot choice or an order number", () => {
    expect(redactPii("I'll take slot 2")).toBe("I'll take slot 2");
    expect(redactPii("Order #12345 please")).toBe("Order #12345 please");
  });

  it("does not touch ordinary conversation text with no PII", () => {
    const text = "Can I book for 4 May at 11am?";
    expect(redactPii(text)).toBe(text);
  });
});
