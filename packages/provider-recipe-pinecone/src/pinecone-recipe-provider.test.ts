import { describe, expect, it } from "vitest";
import { PineconeRecipeProvider } from "./pinecone-recipe-provider.js";
import { FakeEmbeddingAiProvider, FakePineconeClient } from "./test-support.js";

async function seed(client: FakePineconeClient, aiProvider: FakeEmbeddingAiProvider, docs: { id: string; title: string; content: string }[]) {
  const records = await Promise.all(
    docs.map(async (doc) => {
      const { vectors } = await aiProvider.embed({ input: doc.content });
      return { id: doc.id, values: vectors[0]!, metadata: { title: doc.title, content: doc.content } };
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

  it("skips a match whose metadata has no content field, rather than returning a broken result", async () => {
    const client = new FakePineconeClient();
    await client.upsert([{ id: "file-1", values: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], metadata: { title: "Untitled" } }]);

    const aiProvider = new FakeEmbeddingAiProvider();
    const provider = new PineconeRecipeProvider({ client, aiProvider });
    const results = await provider.findRecipes({ query: "chicken" });

    expect(results).toEqual([]);
  });

  it("falls back to the match id as the title when metadata has no title field", async () => {
    const client = new FakePineconeClient();
    await client.upsert([{ id: "file-1", values: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], metadata: { content: "Some chicken content." } }]);

    const aiProvider = new FakeEmbeddingAiProvider();
    const provider = new PineconeRecipeProvider({ client, aiProvider });
    const results = await provider.findRecipes({ query: "chicken" });

    expect(results[0]!.title).toBe("file-1");
  });
});
