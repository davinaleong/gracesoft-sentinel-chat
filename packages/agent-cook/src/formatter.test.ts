import { describe, expect, it } from "vitest";
import { formatRecipe, formatUnidentifiedDish } from "./formatter.js";
import type { Recipe } from "./recipe-generator.js";

const RECIPE: Recipe = {
  dishName: "Laksa",
  servings: 2,
  ingredients: ["laksa paste", "coconut milk"],
  steps: ["Fry the paste.", "Add coconut milk and simmer."],
  substitutions: ["Use tofu puffs instead of prawns."],
  servingSuggestions: ["Top with laksa leaf."],
  nutrition: { calories: 620, protein: "20g", carbohydrates: "70g", fat: "28g", fiber: "3g" },
};

describe("formatRecipe", () => {
  it("includes the dish name, serving count, ingredients, and numbered steps", () => {
    const text = formatRecipe(RECIPE);
    expect(text).toContain("Laksa");
    expect(text).toContain("(serves 2)");
    expect(text).toContain("- laksa paste");
    expect(text).toContain("1. Fry the paste.");
    expect(text).toContain("2. Add coconut milk and simmer.");
  });

  it("includes substitutions and serving suggestions when present", () => {
    const text = formatRecipe(RECIPE);
    expect(text).toContain("Substitutions:");
    expect(text).toContain("Use tofu puffs instead of prawns.");
    expect(text).toContain("Serving suggestions:");
  });

  it("omits substitutions/serving-suggestion sections entirely when empty", () => {
    const text = formatRecipe({ ...RECIPE, substitutions: [], servingSuggestions: [] });
    expect(text).not.toContain("Substitutions:");
    expect(text).not.toContain("Serving suggestions:");
  });

  it("includes nutrition per serving", () => {
    const text = formatRecipe(RECIPE);
    expect(text).toContain("620 kcal");
    expect(text).toContain("20g");
  });

  it("uses singular serving label for 1 serving", () => {
    const text = formatRecipe({ ...RECIPE, servings: 1 });
    expect(text).toContain("(serves 1)");
  });
});

describe("formatUnidentifiedDish", () => {
  it("includes the fallback message and an optional note, without guessing a dish", () => {
    const text = formatUnidentifiedDish({ dishName: null, note: "Too blurry to tell." });
    expect(text).toContain("couldn't identify");
    expect(text).toContain("Too blurry to tell.");
  });

  it("omits the note line when there isn't one", () => {
    const text = formatUnidentifiedDish({ dishName: null });
    expect(text).not.toContain("undefined");
  });
});
