import { describe, expect, it } from "vitest";
import { findPersonalRecipe, isPersonalRecipeRequest } from "./personal-recipe.js";
import { FakeRecipeSourceProvider } from "./test-support.js";

describe("isPersonalRecipeRequest", () => {
  it("recognises common personal-recipe phrasings with the dish name after 'recipe'", () => {
    expect(isPersonalRecipeRequest("do you have my mom's recipe for laksa?")).toBe(true);
    expect(isPersonalRecipeRequest("find my recipe for chicken curry")).toBe(true);
    expect(isPersonalRecipeRequest("what's grandma's recipe for kaya toast")).toBe(true);
    expect(isPersonalRecipeRequest("do we have a family recipe for this?")).toBe(true);
  });

  it("recognises the equally natural phrasing with the dish name between the possessive and 'recipe'", () => {
    // Found via a live WhatsApp demo returning zero matches on exactly this wording.
    expect(isPersonalRecipeRequest("Give me my mushroom pasta recipe")).toBe(true);
    expect(isPersonalRecipeRequest("My creamy mushroom pasta recipe.")).toBe(true);
    expect(isPersonalRecipeRequest("what's mom's famous chicken curry recipe?")).toBe(true);
    expect(isPersonalRecipeRequest("our family kaya toast recipe please")).toBe(true);
  });

  it("recognises 'recipe' appearing before the possessive ('recipe for my mom's X')", () => {
    expect(isPersonalRecipeRequest("what's the recipe for my mom's chicken curry?")).toBe(true);
    expect(isPersonalRecipeRequest("send me the recipe for our family laksa")).toBe(true);
  });

  it("does not flag unrelated text", () => {
    expect(isPersonalRecipeRequest("make it vegetarian")).toBe(false);
    expect(isPersonalRecipeRequest("can you give me a grocery list")).toBe(false);
  });

  it("does not flag a generic recipe request with no possessive/ownership word", () => {
    expect(isPersonalRecipeRequest("give me the recipe for pad thai")).toBe(false);
    expect(isPersonalRecipeRequest("what's a good recipe for chicken curry")).toBe(false);
  });

  it("does not match a possessive word and 'recipe' that are too far apart to be the same request", () => {
    expect(
      isPersonalRecipeRequest(
        "my kitchen is a mess right now, I haven't cleaned it in weeks and honestly I should really get around to it. anyway, do you have a good recipe for pad thai?"
      )
    ).toBe(false);
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
