import { describe, expect, it } from "vitest";
import { GoogleDriveRecipeProvider } from "./google-drive-recipe-provider.js";
import { FakeEmbeddingAiProvider, FakeGoogleDriveClient } from "./test-support.js";

const RECIPE_FILES = [
  { id: "file-1", name: "Mom's Chicken Curry", content: "A rich chicken curry with coconut milk and spices." },
  { id: "file-2", name: "Grandma's Beef Stew", content: "Slow-cooked beef stew with root vegetables." },
  { id: "file-3", name: "Auntie's Fish Soup", content: "A light fish soup with vegetables." },
];

describe("GoogleDriveRecipeProvider", () => {
  it("finds the recipe whose content is most semantically similar to the query", async () => {
    const provider = new GoogleDriveRecipeProvider({
      client: new FakeGoogleDriveClient(RECIPE_FILES),
      aiProvider: new FakeEmbeddingAiProvider(),
      folderId: "folder-1",
    });

    const results = await provider.findRecipes({ query: "I want a spicy chicken curry" });

    expect(results[0]!.id).toBe("file-1");
    expect(results[0]!.title).toBe("Mom's Chicken Curry");
    expect(results[0]!.raw).toMatchObject({ content: expect.stringContaining("chicken curry") });
  });

  it("returns an empty array when the folder has no files", async () => {
    const provider = new GoogleDriveRecipeProvider({
      client: new FakeGoogleDriveClient([]),
      aiProvider: new FakeEmbeddingAiProvider(),
      folderId: "folder-1",
    });

    expect(await provider.findRecipes({ query: "anything" })).toEqual([]);
  });

  it("exports Google Docs (rather than downloading raw bytes) based on mimeType", async () => {
    const provider = new GoogleDriveRecipeProvider({
      client: new FakeGoogleDriveClient([
        { id: "doc-1", name: "Family Laksa", mimeType: "application/vnd.google-apps.document", content: "Spicy noodle soup with coconut broth." },
      ]),
      aiProvider: new FakeEmbeddingAiProvider(),
      folderId: "folder-1",
    });

    const results = await provider.findRecipes({ query: "noodle soup" });

    expect(results[0]!.title).toBe("Family Laksa");
  });

  it("only builds the index once across multiple findRecipes calls", async () => {
    let listCalls = 0;
    const client = new FakeGoogleDriveClient(RECIPE_FILES);
    const originalList = client.files.list.bind(client.files);
    client.files.list = async (...args: Parameters<typeof originalList>) => {
      listCalls++;
      return originalList(...args);
    };

    const provider = new GoogleDriveRecipeProvider({ client, aiProvider: new FakeEmbeddingAiProvider(), folderId: "folder-1" });

    await provider.findRecipes({ query: "chicken" });
    await provider.findRecipes({ query: "beef" });

    expect(listCalls).toBe(1);
  });

  it("respects a custom topK", async () => {
    const provider = new GoogleDriveRecipeProvider({
      client: new FakeGoogleDriveClient(RECIPE_FILES),
      aiProvider: new FakeEmbeddingAiProvider(),
      folderId: "folder-1",
      topK: 1,
    });

    const results = await provider.findRecipes({ query: "chicken curry" });

    expect(results).toHaveLength(1);
  });
});
