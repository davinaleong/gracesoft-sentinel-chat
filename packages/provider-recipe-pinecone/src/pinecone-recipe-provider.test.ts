import { describe, expect, it } from "vitest";
import { PineconeRecipeProvider } from "./pinecone-recipe-provider.js";
import { FakeEmbeddingAiProvider, FakePineconeClient } from "./test-support.js";

async function seed(client: FakePineconeClient, aiProvider: FakeEmbeddingAiProvider, docs: { id: string; title: string; content: string }[]) {
  const records = await Promise.all(
    docs.map(async (doc) => {
      const { vectors } = await aiProvider.embed({ input: doc.content });
      // "name"/"text", not "title"/"content" — matches the real metadata
      // shape written by ingestion (this package's own sync tool, or an
      // external one populating the same index). See pinecone-recipe-provider.ts.
      return { id: doc.id, values: vectors[0]!, metadata: { name: doc.title, text: doc.content } };
    })
  );
  await client.upsert(records);
}

describe("PineconeRecipeProvider", () => {
  it("embeds the query and returns the closest-matching indexed recipe", async () => {
    const client = new FakePineconeClient();
    const aiProvider = new FakeEmbeddingAiProvider();
    await seed(client, aiProvider, [
      { id: "file-1", title: "Mom's Chicken Curry", content: "A rich chicken curry with coconut milk and spices." },
      { id: "file-2", title: "Grandma's Beef Stew", content: "Slow-cooked beef stew with root vegetables." },
    ]);

    const provider = new PineconeRecipeProvider({ client, aiProvider });
    const results = await provider.findRecipes({ query: "I want a spicy chicken curry" });

    expect(results[0]!.id).toBe("file-1");
    expect(results[0]!.title).toBe("Mom's Chicken Curry");
    expect(results[0]!.raw).toMatchObject({ content: expect.stringContaining("chicken curry") });
  });

  it("returns an empty array when the index has no matches at all", async () => {
    const provider = new PineconeRecipeProvider({ client: new FakePineconeClient(), aiProvider: new FakeEmbeddingAiProvider() });
    expect(await provider.findRecipes({ query: "anything" })).toEqual([]);
  });

  it("respects a custom topK", async () => {
    const client = new FakePineconeClient();
    const aiProvider = new FakeEmbeddingAiProvider();
    await seed(client, aiProvider, [
      { id: "file-1", title: "Mom's Chicken Curry", content: "A rich chicken curry with coconut milk and spices." },
      { id: "file-2", title: "Grandma's Beef Stew", content: "Slow-cooked beef stew with root vegetables." },
      { id: "file-3", title: "Auntie's Fish Soup", content: "A light fish soup with vegetables." },
    ]);

    const provider = new PineconeRecipeProvider({ client, aiProvider, topK: 1 });
    const results = await provider.findRecipes({ query: "chicken curry" });

    expect(results).toHaveLength(1);
    expect(client.queryCalls[0]).toMatchObject({ topK: 1 });
  });

  it("skips a match whose metadata has no text field, rather than returning a broken result", async () => {
    const client = new FakePineconeClient();
    await client.upsert([{ id: "file-1", values: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], metadata: { name: "Untitled" } }]);

    const aiProvider = new FakeEmbeddingAiProvider();
    const provider = new PineconeRecipeProvider({ client, aiProvider });
    const results = await provider.findRecipes({ query: "chicken" });

    expect(results).toEqual([]);
  });

  it("falls back to the match id as the title when metadata has no name field", async () => {
    const client = new FakePineconeClient();
    await client.upsert([{ id: "file-1", values: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], metadata: { text: "Some chicken content." } }]);

    const aiProvider = new FakeEmbeddingAiProvider();
    const provider = new PineconeRecipeProvider({ client, aiProvider });
    const results = await provider.findRecipes({ query: "chicken" });

    expect(results[0]!.title).toBe("file-1");
  });

  it("regression: reads the actual external-sync metadata shape (name/text/fileId/section), not just this package's own sync tool's shape", async () => {
    const client = new FakePineconeClient();
    await client.upsert([
      {
        id: "155bNcbjK5vAwee0wXSY7S8JQVfovP_TBRwOKVh790Fg-0",
        values: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        metadata: {
          fileId: "155bNcbjK5vAwee0wXSY7S8JQVfovP_TBRwOKVh790Fg",
          name: "Chocolate Mug Cake",
          section: "Chocolate Mug Cake",
          text: "Ingredients:\n- 4 tbsp flour\n\nSteps:\n1. Mix all ingredients in a mug.",
        },
      },
    ]);

    const aiProvider = new FakeEmbeddingAiProvider();
    // minScore: 0 — this test is about metadata field parsing, not
    // relevance ranking; "chocolate mug cake" shares no words with
    // FakeEmbeddingAiProvider's fixed food-word vocabulary, so it'd
    // otherwise score 0 regardless of how well-matched the content is.
    const provider = new PineconeRecipeProvider({ client, aiProvider, minScore: 0 });
    const results = await provider.findRecipes({ query: "chocolate mug cake" });

    expect(results[0]!.title).toBe("Chocolate Mug Cake");
    expect(results[0]!.raw).toMatchObject({ content: expect.stringContaining("Mix all ingredients in a mug") });
  });

  describe("minScore relevance threshold", () => {
    it("discards a weak match instead of presenting it as found — regression: 'chicken soup' (absent) used to return an unrelated tomato-soup-style recipe just because it was the closest available vector", async () => {
      const client = new FakePineconeClient();
      const aiProvider = new FakeEmbeddingAiProvider();
      // "rice noodle vegetable sweet spicy" shares zero words with the
      // query "chicken" — but FakePineconeClient still returns it as the
      // (only, therefore closest) match, same shape as a real weak match.
      await seed(client, aiProvider, [{ id: "file-1", title: "Unrelated Dish", content: "rice noodle vegetable sweet spicy" }]);

      const provider = new PineconeRecipeProvider({ client, aiProvider });
      const results = await provider.findRecipes({ query: "chicken" });

      expect(results).toEqual([]);
    });

    it("still returns a genuinely strong match", async () => {
      const client = new FakePineconeClient();
      const aiProvider = new FakeEmbeddingAiProvider();
      await seed(client, aiProvider, [{ id: "file-1", title: "Chicken Curry", content: "chicken curry" }]);

      const provider = new PineconeRecipeProvider({ client, aiProvider });
      const results = await provider.findRecipes({ query: "chicken curry" });

      expect(results[0]!.title).toBe("Chicken Curry");
    });

    it("respects a custom minScore override", async () => {
      const client = new FakePineconeClient();
      const aiProvider = new FakeEmbeddingAiProvider();
      // "chicken" alone vs a 5-distinct-word doc scores ~0.45 — below the
      // 0.5 default, but should pass through a permissive override.
      await seed(client, aiProvider, [{ id: "file-1", title: "Mixed Dish", content: "chicken beef fish rice noodle" }]);

      const provider = new PineconeRecipeProvider({ client, aiProvider, minScore: 0.3 });
      const results = await provider.findRecipes({ query: "chicken" });

      expect(results[0]!.title).toBe("Mixed Dish");
    });
  });

  describe("verifyRelevance (LLM double-check)", () => {
    it("discards a candidate that clears minScore but the LLM says isn't actually the requested dish — the near-tie case minScore alone can't catch", async () => {
      const client = new FakePineconeClient();
      // Always says "no" — standing in for the real near-tie case where an
      // unrelated soup scores just as well as a correct match would.
      const aiProvider = new FakeEmbeddingAiProvider(() => ({ text: "no" }));
      await seed(client, aiProvider, [{ id: "file-1", title: "Tomato Egg Soup", content: "tomato soup" }]);

      const provider = new PineconeRecipeProvider({ client, aiProvider });
      const results = await provider.findRecipes({ query: "chicken soup" });

      expect(results).toEqual([]);
    });

    it("keeps a candidate the LLM confirms is relevant", async () => {
      const client = new FakePineconeClient();
      const aiProvider = new FakeEmbeddingAiProvider(() => ({ text: "yes" }));
      await seed(client, aiProvider, [{ id: "file-1", title: "Chicken Soup", content: "chicken soup" }]);

      const provider = new PineconeRecipeProvider({ client, aiProvider });
      const results = await provider.findRecipes({ query: "chicken soup" });

      expect(results[0]!.title).toBe("Chicken Soup");
    });

    it("skips the LLM call entirely when verifyRelevance is false", async () => {
      const client = new FakePineconeClient();
      const aiProvider = new FakeEmbeddingAiProvider(() => {
        throw new Error("chatComplete should not be called when verifyRelevance is false");
      });
      await seed(client, aiProvider, [{ id: "file-1", title: "Chicken Soup", content: "chicken soup" }]);

      const provider = new PineconeRecipeProvider({ client, aiProvider, verifyRelevance: false });
      const results = await provider.findRecipes({ query: "chicken soup" });

      expect(results[0]!.title).toBe("Chicken Soup");
    });
  });

  describe("listRecipes", () => {
    it("returns every indexed recipe, no query involved", async () => {
      const client = new FakePineconeClient();
      const aiProvider = new FakeEmbeddingAiProvider();
      await seed(client, aiProvider, [
        { id: "file-1", title: "Mom's Chicken Curry", content: "A rich chicken curry with coconut milk and spices." },
        { id: "file-2", title: "Grandma's Beef Stew", content: "Slow-cooked beef stew with root vegetables." },
      ]);

      const provider = new PineconeRecipeProvider({ client, aiProvider });
      const results = await provider.listRecipes();

      expect(results.map((r) => r.title).sort()).toEqual(["Grandma's Beef Stew", "Mom's Chicken Curry"]);
    });

    it("returns an empty array for an empty index", async () => {
      const provider = new PineconeRecipeProvider({ client: new FakePineconeClient(), aiProvider: new FakeEmbeddingAiProvider() });
      expect(await provider.listRecipes()).toEqual([]);
    });

    it("groups multiple section-chunk vectors of the same document into one recipe, by fileId", async () => {
      const client = new FakePineconeClient();
      await client.upsert([
        { id: "doc-1#ingredients", values: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], metadata: { fileId: "doc-1", name: "Chocolate Mug Cake", section: "Ingredients", text: "flour, cocoa" } },
        { id: "doc-1#steps", values: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0], metadata: { fileId: "doc-1", name: "Chocolate Mug Cake", section: "Steps", text: "mix and microwave" } },
      ]);

      const provider = new PineconeRecipeProvider({ client, aiProvider: new FakeEmbeddingAiProvider() });
      const results = await provider.listRecipes();

      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe("Chocolate Mug Cake");
    });
  });
});
