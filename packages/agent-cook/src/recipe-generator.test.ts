import { describe, expect, it } from "vitest";
import { generateRecipe, type Recipe } from "./recipe-generator.js";
import { fakeAiProviderWith } from "./test-support.js";

const WELL_FORMED_JSON = JSON.stringify({
  dishName: "Laksa",
  servings: 2,
  ingredients: ["laksa paste", "coconut milk", "rice noodles", "prawns"],
  steps: ["Fry the paste.", "Add coconut milk and simmer.", "Add noodles and prawns."],
  substitutions: ["Use tofu puffs instead of prawns for a vegetarian version."],
  servingSuggestions: ["Top with laksa leaf and sambal."],
  nutrition: { calories: 620, protein: "20g", carbohydrates: "70g", fat: "28g", fiber: "3g" },
});

describe("generateRecipe", () => {
  it("returns a fully structured recipe for a well-formed JSON response", async () => {
    const provider = fakeAiProviderWith(
      () => ({ text: WELL_FORMED_JSON }),
      () => ({ text: "unused" })
    );
    const recipe = await generateRecipe({ dishName: "Laksa", aiProvider: provider });
    expect(recipe).toMatchObject({
      dishName: "Laksa",
      servings: 2,
      ingredients: expect.arrayContaining(["laksa paste"]),
      nutrition: { calories: 620 },
    });
  });

  it("includes ingredients, method, substitutions, and serving suggestions", async () => {
    const provider = fakeAiProviderWith(
      () => ({ text: WELL_FORMED_JSON }),
      () => ({ text: "unused" })
    );
    const recipe = await generateRecipe({ dishName: "Laksa", aiProvider: provider });
    expect(recipe!.ingredients.length).toBeGreaterThan(0);
    expect(recipe!.steps.length).toBeGreaterThan(0);
    expect(recipe!.substitutions.length).toBeGreaterThan(0);
    expect(recipe!.servingSuggestions.length).toBeGreaterThan(0);
  });

  it("returns undefined when the model response can't be parsed into a recipe", async () => {
    const provider = fakeAiProviderWith(
      () => ({ text: "Sure, here's a great laksa recipe..." }), // not JSON
      () => ({ text: "unused" })
    );
    const recipe = await generateRecipe({ dishName: "Laksa", aiProvider: provider });
    expect(recipe).toBeUndefined();
  });

  it("a dietary adjustment request modifies the ingredient list of the base recipe", async () => {
    const baseRecipe: Recipe = {
      dishName: "Laksa",
      servings: 2,
      ingredients: ["laksa paste", "coconut milk", "rice noodles", "prawns", "fish cake"],
      steps: ["Fry the paste.", "Add coconut milk and simmer.", "Add noodles, prawns, and fish cake."],
      substitutions: [],
      servingSuggestions: [],
      nutrition: { calories: 620, protein: "20g", carbohydrates: "70g", fat: "28g", fiber: "3g" },
    };
    const vegetarianJson = JSON.stringify({
      dishName: "Laksa",
      servings: 2,
      ingredients: ["laksa paste", "coconut milk", "rice noodles", "tofu puffs", "bean sprouts"],
      steps: ["Fry the paste.", "Add coconut milk and simmer.", "Add noodles and tofu puffs."],
      substitutions: [],
      servingSuggestions: [],
      nutrition: { calories: 480, protein: "12g", carbohydrates: "68g", fat: "18g", fiber: "4g" },
    });
    const provider = fakeAiProviderWith(
      () => ({ text: vegetarianJson }),
      () => ({ text: "unused" })
    );

    const recipe = await generateRecipe({
      dishName: baseRecipe.dishName,
      aiProvider: provider,
      dietaryAdjustment: "make it vegetarian",
      baseRecipe,
    });

    expect(recipe!.ingredients).not.toContain("prawns");
    expect(recipe!.ingredients).toContain("tofu puffs");

    // The prompt sent to the model must reference the dietary constraint and
    // the existing ingredients, not just the bare dish name.
    const { messages } = provider.chatCompleteCalls[0]!;
    const userMessage = messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain("vegetarian");
    expect(userMessage).toContain("prawns");
  });
});
