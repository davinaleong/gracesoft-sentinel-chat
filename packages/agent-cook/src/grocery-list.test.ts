import { describe, expect, it } from "vitest";
import { generateGroceryList, isGroceryListRequest } from "./grocery-list.js";
import { fakeAiProviderWith } from "./test-support.js";
import type { Recipe } from "./recipe-generator.js";

describe("isGroceryListRequest", () => {
  it("recognises common grocery-list/meal-plan phrasings", () => {
    expect(isGroceryListRequest("can you give me a grocery list")).toBe(true);
    expect(isGroceryListRequest("what's on the shopping list?")).toBe(true);
    expect(isGroceryListRequest("What do I need to buy for these?")).toBe(true);
    expect(isGroceryListRequest("can you meal plan for the week")).toBe(true);
  });

  it("does not flag unrelated text", () => {
    expect(isGroceryListRequest("make it vegetarian")).toBe(false);
    expect(isGroceryListRequest("thanks, looks great")).toBe(false);
  });
});

const RECIPE_A: Recipe = {
  dishName: "Chicken Rice",
  servings: 2,
  ingredients: ["2 chicken thighs", "2 cups jasmine rice", "2 cloves garlic"],
  steps: ["Poach chicken.", "Cook rice."],
  substitutions: [],
  servingSuggestions: [],
  nutrition: { calories: 550, protein: "35g", carbohydrates: "60g", fat: "15g", fiber: "2g" },
};

const RECIPE_B: Recipe = {
  dishName: "Laksa",
  servings: 2,
  ingredients: ["laksa paste", "coconut milk", "2 cloves garlic"],
  steps: ["Fry paste.", "Simmer."],
  substitutions: [],
  servingSuggestions: [],
  nutrition: { calories: 620, protein: "20g", carbohydrates: "70g", fat: "28g", fiber: "3g" },
};

describe("generateGroceryList", () => {
  it("sends both recipes' ingredients to the model and returns the consolidated items", async () => {
    const consolidatedJson = JSON.stringify({
      items: ["2 chicken thighs", "2 cups jasmine rice", "4 cloves garlic", "laksa paste", "coconut milk"],
    });
    const aiProvider = fakeAiProviderWith(
      () => ({ text: consolidatedJson }),
      () => ({ text: "unused" })
    );

    const items = await generateGroceryList([RECIPE_A, RECIPE_B], aiProvider);

    expect(items).toEqual(["2 chicken thighs", "2 cups jasmine rice", "4 cloves garlic", "laksa paste", "coconut milk"]);
    const userMessage = aiProvider.chatCompleteCalls[0]!.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain("Chicken Rice");
    expect(userMessage).toContain("Laksa");
    expect(userMessage).toContain("2 chicken thighs");
  });

  it("returns undefined when the model doesn't return the requested JSON shape", async () => {
    const aiProvider = fakeAiProviderWith(
      () => ({ text: "Sure, here's your list..." }),
      () => ({ text: "unused" })
    );
    const items = await generateGroceryList([RECIPE_A], aiProvider);
    expect(items).toBeUndefined();
  });

  it("returns undefined for an empty items array rather than a useless empty list", async () => {
    const aiProvider = fakeAiProviderWith(
      () => ({ text: JSON.stringify({ items: [] }) }),
      () => ({ text: "unused" })
    );
    const items = await generateGroceryList([RECIPE_A], aiProvider);
    expect(items).toBeUndefined();
  });
});
