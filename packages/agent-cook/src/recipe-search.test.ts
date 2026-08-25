import { describe, expect, it } from "vitest";
import { extractRecipeSearchDishName, isRecipeSearchRequest } from "./recipe-search.js";

describe("extractRecipeSearchDishName", () => {
  it("extracts the dish name from 'recipe for X'", () => {
    expect(extractRecipeSearchDishName("recipe for chicken noodle soup")).toBe("chicken noodle soup");
  });

  it("extracts the dish name from 'recipe of X'", () => {
    expect(extractRecipeSearchDishName("what's a good recipe of pad thai?")).toBe("pad thai");
  });

  it("extracts the dish name from 'how do I make X' / 'how to make X'", () => {
    expect(extractRecipeSearchDishName("how do I make chicken noodle soup")).toBe("chicken noodle soup");
    expect(extractRecipeSearchDishName("how to make pad thai please")).toBe("pad thai");
    expect(extractRecipeSearchDishName("how can I make a beef stew")).toBe("beef stew");
  });

  it("ignores whatever precedes 'recipe for' — the capture only ever starts after it", () => {
    expect(extractRecipeSearchDishName("give me a recipe for chicken noodle soup")).toBe("chicken noodle soup");
    expect(extractRecipeSearchDishName("can I get the recipe for laksa")).toBe("laksa");
  });

  it("strips a leading article from 'how (do I/can I/to) make a/an/the X'", () => {
    expect(extractRecipeSearchDishName("how do I make a beef stew")).toBe("beef stew");
    expect(extractRecipeSearchDishName("how to make an omelette")).toBe("omelette");
  });

  it("strips trailing filler (please/pls/thanks) and punctuation", () => {
    expect(extractRecipeSearchDishName("recipe for laksa please")).toBe("laksa");
    expect(extractRecipeSearchDishName("recipe for laksa?")).toBe("laksa");
    expect(extractRecipeSearchDishName("recipe for laksa!!")).toBe("laksa");
    expect(extractRecipeSearchDishName("recipe for laksa, thanks")).toBe("laksa");
  });

  it("returns undefined for text with no recognisable recipe-search phrasing", () => {
    expect(extractRecipeSearchDishName("make it vegetarian")).toBeUndefined();
    expect(extractRecipeSearchDishName("what are your opening hours?")).toBeUndefined();
    expect(extractRecipeSearchDishName("hi")).toBeUndefined();
  });

  it("returns undefined for a bare 'recipe for' with nothing after it", () => {
    expect(extractRecipeSearchDishName("recipe for")).toBeUndefined();
    expect(extractRecipeSearchDishName("recipe for   ")).toBeUndefined();
  });
});

describe("isRecipeSearchRequest", () => {
  it("mirrors extractRecipeSearchDishName's true/false outcome", () => {
    expect(isRecipeSearchRequest("recipe for chicken noodle soup")).toBe(true);
    expect(isRecipeSearchRequest("make it vegetarian")).toBe(false);
  });
});
