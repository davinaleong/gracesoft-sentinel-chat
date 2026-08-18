import { describe, expect, it } from "vitest";
import { findPersonalRecipe, isPersonalRecipeRequest } from "./personal-recipe.js";
import { FakeRecipeSourceProvider } from "./test-support.js";

describe("isPersonalRecipeRequest", () => {
  it("recognises common personal-recipe phrasings", () => {
    expect(isPersonalRecipeRequest("do you have my mom's recipe for laksa?")).toBe(true);
    expect(isPersonalRecipeRequest("find my recipe for chicken curry")).toBe(true);
    expect(isPersonalRecipeRequest("what's grandma's recipe for kaya toast")).toBe(true);
    expect(isPersonalRecipeRequest("do we have a family recipe for this?")).toBe(true);
  });

  it("does not flag unrelated text", () => {
    expect(isPersonalRecipeRequest("make it vegetarian")).toBe(false);
    expect(isPersonalRecipeRequest("can you give me a grocery list")).toBe(false);
  });
});

describe("findPersonalRecipe", () => {
  it("returns the title and content of the top match", async () => {
    const provider = new FakeRecipeSourceProvider([
      { id: "1", title: "Mom's Chicken Curry", raw: { content: "A rich chicken curry recipe..." } },
    ]);

    const match = await findPersonalRecipe("my mom's chicken curry", provider);

    expect(match).toEqual({ title: "Mom's Chicken Curry", content: "A rich chicken curry recipe..." });
    expect(provider.findRecipesCalls).toEqual([{ query: "my mom's chicken curry" }]);
  });

  it("returns undefined when there are no results", async () => {
    const provider = new FakeRecipeSourceProvider([]);
    expect(await findPersonalRecipe("anything", provider)).toBeUndefined();
  });

  it("returns undefined when the top result's raw content isn't the expected shape", async () => {
    const provider = new FakeRecipeSourceProvider([{ id: "1", title: "Untitled", raw: { notContent: "oops" } }]);
    expect(await findPersonalRecipe("anything", provider)).toBeUndefined();
  });
});
