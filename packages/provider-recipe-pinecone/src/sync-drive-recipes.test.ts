import { describe, expect, it } from "vitest";
import { syncDriveRecipesToPinecone } from "./sync-drive-recipes.js";
import { FakeEmbeddingAiProvider, FakeGoogleDriveClient, FakePineconeClient } from "./test-support.js";

describe("syncDriveRecipesToPinecone", () => {
  it("embeds every document in the Drive folder and upserts them into Pinecone with title/content metadata", async () => {
    const driveClient = new FakeGoogleDriveClient([
      { id: "file-1", name: "Mom's Chicken Curry", content: "A rich chicken curry with coconut milk and spices." },
      { id: "file-2", name: "Grandma's Beef Stew", content: "Slow-cooked beef stew with root vegetables." },
    ]);
    const pineconeClient = new FakePineconeClient();
    const aiProvider = new FakeEmbeddingAiProvider();

    const result = await syncDriveRecipesToPinecone({ driveClient, pineconeClient, aiProvider, folderId: "folder-1" });

    expect(result).toEqual({ synced: 2, skipped: 0 });
    expect(pineconeClient.upsertCalls).toHaveLength(1);
    expect(pineconeClient.upsertCalls[0]).toEqual([
      { id: "file-1", values: expect.any(Array), metadata: { title: "Mom's Chicken Curry", content: "A rich chicken curry with coconut milk and spices." } },
      { id: "file-2", values: expect.any(Array), metadata: { title: "Grandma's Beef Stew", content: "Slow-cooked beef stew with root vegetables." } },
    ]);
  });

  it("does not call upsert at all for an empty folder", async () => {
    const pineconeClient = new FakePineconeClient();
    const result = await syncDriveRecipesToPinecone({
      driveClient: new FakeGoogleDriveClient([]),
      pineconeClient,
      aiProvider: new FakeEmbeddingAiProvider(),
      folderId: "folder-1",
    });

    expect(result).toEqual({ synced: 0, skipped: 0 });
    expect(pineconeClient.upsertCalls).toHaveLength(0);
  });

  it("indexed recipes are then queryable via PineconeRecipeProvider", async () => {
    const driveClient = new FakeGoogleDriveClient([
      { id: "file-1", name: "Mom's Chicken Curry", content: "A rich chicken curry with coconut milk and spices." },
    ]);
    const pineconeClient = new FakePineconeClient();
    const aiProvider = new FakeEmbeddingAiProvider();

    await syncDriveRecipesToPinecone({ driveClient, pineconeClient, aiProvider, folderId: "folder-1" });
    const { matches } = await pineconeClient.query({ vector: (await aiProvider.embed({ input: "chicken curry" })).vectors[0]!, topK: 3 });

    expect(matches[0]!.id).toBe("file-1");
    expect(matches[0]!.metadata).toMatchObject({ title: "Mom's Chicken Curry" });
  });
});
