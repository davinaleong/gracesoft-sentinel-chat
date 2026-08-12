import { describe, expect, it } from "vitest";
import { BusinessConfigSchema } from "./business-config.js";

describe("BusinessConfigSchema", () => {
  it("accepts a full business config with a dated exception", () => {
    const result = BusinessConfigSchema.safeParse({
      businessId: "biz-1",
      timezone: "Asia/Singapore",
      faqBlueprintPath: "./blueprints/biz-1-faq.json",
      calendarId: "biz-1-calendar",
      businessHours: {
        timezone: "Asia/Singapore",
        weekly: {
          mon: { open: "09:00", close: "18:00" },
          tue: { open: "09:00", close: "18:00" },
          wed: { open: "09:00", close: "18:00" },
          thu: { open: "09:00", close: "18:00" },
          fri: { open: "09:00", close: "18:00" },
          sat: { open: "09:00", close: "13:00" },
          sun: null,
        },
        exceptions: [{ date: "2026-05-02", hours: null, reason: "Public holiday" }],
      },
    });
    expect(result.success).toBe(true);
  });
});
