import { describe, expect, it } from "vitest";
import { createPineconeClient } from "./pinecone-client.js";

describe("createPineconeClient", () => {
  it("builds a client exposing the expected methods without making a network call", () => {
    // Constructing the Pinecone SDK client and resolving an index handle is
    // purely local — no request is made until a method is actually invoked.
    const client = createPineconeClient({ apiKey: "test-key", indexName: "test-index" });
    expect(typeof client.query).toBe("function");
    expect(typeof client.upsert).toBe("function");
  });

  it("also builds cleanly when scoped to a namespace", () => {
    const client = createPineconeClient({ apiKey: "test-key", indexName: "test-index", namespace: "recipes" });
    expect(typeof client.query).toBe("function");
    expect(typeof client.upsert).toBe("function");
  });
});
