import { describe, expect, it } from "vitest";
import { formatGroceryList, formatPersonalRecipe, formatRecipe, formatRecipeList, formatUnidentifiedDish } from "./formatter.js";
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

describe("formatPersonalRecipe", () => {
  it("includes the recipe title and its verbatim content", () => {
    const text = formatPersonalRecipe({ title: "Mom's Chicken Curry", content: "Simmer for 40 minutes..." });
    expect(text).toContain("Mom's Chicken Curry");
    expect(text).toContain("Simmer for 40 minutes...");
  });
});

describe("formatRecipeList", () => {
  it("numbers each title and states the total count", () => {
    const text = formatRecipeList(["Mom's Chicken Curry", "Grandma's Beef Stew"]);
    expect(text).toContain("You have 2 saved recipes:");
    expect(text).toContain("1. Mom's Chicken Curry");
    expect(text).toContain("2. Grandma's Beef Stew");
  });

  it("uses singular phrasing for exactly one recipe", () => {
    expect(formatRecipeList(["Laksa"])).toContain("You have 1 saved recipe:");
  });

  it("returns a no-recipes message for an empty list, rather than an empty list", () => {
    expect(formatRecipeList([])).toMatch(/don't have any saved recipes/i);
  });
});

describe("formatGroceryList", () => {
  it("lists the dish names and each item as a bullet", () => {
    const text = formatGroceryList(["2 chicken thighs", "4 cloves garlic"], ["Chicken Rice", "Laksa"]);
    expect(text).toContain("Chicken Rice, Laksa");
    expect(text).toContain("- 2 chicken thighs");
    expect(text).toContain("- 4 cloves garlic");
  });
});
