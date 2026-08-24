import { describe, expect, it } from "vitest";
import { listRecipeDocuments } from "./list-recipe-documents.js";
import { FakeGoogleDriveClient } from "./test-support.js";

describe("listRecipeDocuments", () => {
  it("lists every file in the folder with its downloaded text content", async () => {
    const client = new FakeGoogleDriveClient([
      { id: "file-1", name: "Mom's Chicken Curry", content: "A rich chicken curry with coconut milk and spices." },
      { id: "file-2", name: "Grandma's Beef Stew", content: "Slow-cooked beef stew with root vegetables." },
    ]);

    const documents = await listRecipeDocuments(client, "folder-1");

    expect(documents).toEqual([
      { id: "file-1", title: "Mom's Chicken Curry", content: "A rich chicken curry with coconut milk and spices." },
      { id: "file-2", title: "Grandma's Beef Stew", content: "Slow-cooked beef stew with root vegetables." },
    ]);
  });

  it("exports Google Docs to plain text rather than downloading raw bytes, based on mimeType", async () => {
    const client = new FakeGoogleDriveClient([
      { id: "doc-1", name: "Family Laksa", mimeType: "application/vnd.google-apps.document", content: "Spicy noodle soup with coconut broth." },
    ]);

    const documents = await listRecipeDocuments(client, "folder-1");

    expect(documents).toEqual([{ id: "doc-1", title: "Family Laksa", content: "Spicy noodle soup with coconut broth." }]);
  });

  it("returns an empty array for an empty folder", async () => {
    const client = new FakeGoogleDriveClient([]);
    expect(await listRecipeDocuments(client, "folder-1")).toEqual([]);
  });

  it("skips a file whose content is empty/whitespace-only rather than including a blank document", async () => {
    const client = new FakeGoogleDriveClient([
      { id: "file-1", name: "Empty Note", content: "   \n  " },
      { id: "file-2", name: "Real Recipe", content: "Actual content here." },
    ]);

    const documents = await listRecipeDocuments(client, "folder-1");

    expect(documents).toEqual([{ id: "file-2", title: "Real Recipe", content: "Actual content here." }]);
  });

  it("trims surrounding whitespace from downloaded content", async () => {
    const client = new FakeGoogleDriveClient([{ id: "file-1", name: "Padded", content: "  Some content.  \n" }]);
    const documents = await listRecipeDocuments(client, "folder-1");
    expect(documents[0]!.content).toBe("Some content.");
  });
});
