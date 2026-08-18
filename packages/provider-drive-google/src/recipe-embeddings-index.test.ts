import { describe, expect, it } from "vitest";
import { RecipeEmbeddingsIndex, cosineSimilarity } from "./recipe-embeddings-index.js";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 1], [1, 0, 1])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 rather than NaN/throwing for a zero vector", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("RecipeEmbeddingsIndex", () => {
  it("returns the closest matches first, up to topK", () => {
    const index = new RecipeEmbeddingsIndex();
    index.add({ id: "1", title: "Chicken Curry", content: "...", embedding: [1, 0, 0] });
    index.add({ id: "2", title: "Beef Stew", content: "...", embedding: [0, 1, 0] });
    index.add({ id: "3", title: "Chicken Soup", content: "...", embedding: [0.9, 0.1, 0] });

    const results = index.search([1, 0, 0], 2);

    expect(results.map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("returns fewer than topK when the index has fewer items", () => {
    const index = new RecipeEmbeddingsIndex();
    index.add({ id: "1", title: "Only Recipe", content: "...", embedding: [1, 0] });

    expect(index.search([1, 0], 5)).toHaveLength(1);
  });

  it("reports its size", () => {
    const index = new RecipeEmbeddingsIndex();
    expect(index.size).toBe(0);
    index.add({ id: "1", title: "X", content: "...", embedding: [1] });
    expect(index.size).toBe(1);
  });
});
