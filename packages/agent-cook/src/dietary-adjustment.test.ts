import { describe, expect, it } from "vitest";
import { isDietaryAdjustmentRequest } from "./dietary-adjustment.js";

describe("isDietaryAdjustmentRequest", () => {
  it("recognises common dietary requirement phrasings", () => {
    expect(isDietaryAdjustmentRequest("make it vegetarian")).toBe(true);
    expect(isDietaryAdjustmentRequest("can this be vegan?")).toBe(true);
    expect(isDietaryAdjustmentRequest("is there a gluten free version")).toBe(true);
    expect(isDietaryAdjustmentRequest("gluten-free please")).toBe(true);
    expect(isDietaryAdjustmentRequest("no nuts please, allergy")).toBe(true);
    expect(isDietaryAdjustmentRequest("halal option?")).toBe(true);
  });

  it("does not flag unrelated text", () => {
    expect(isDietaryAdjustmentRequest("that looks delicious")).toBe(false);
    expect(isDietaryAdjustmentRequest("how many servings is this")).toBe(false);
  });
});
