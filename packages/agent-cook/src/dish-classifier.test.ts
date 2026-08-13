import { describe, expect, it } from "vitest";
import { classifyDish } from "./dish-classifier.js";
import { fakeAiProviderWith } from "./test-support.js";

describe("classifyDish", () => {
  it("returns the identified dish name for a clear photo", async () => {
    const provider = fakeAiProviderWith(
      () => ({ text: "unused" }),
      () => ({ text: JSON.stringify({ dishName: "Laksa" }) })
    );
    const result = await classifyDish("https://example.com/laksa.jpg", provider);
    expect(result.dishName).toBe("Laksa");
  });

  it("returns null (not a confident wrong guess) for an ambiguous photo", async () => {
    const provider = fakeAiProviderWith(
      () => ({ text: "unused" }),
      () => ({ text: JSON.stringify({ dishName: null, note: "Too blurry to tell." }) })
    );
    const result = await classifyDish("https://example.com/blurry.jpg", provider);
    expect(result.dishName).toBeNull();
    expect(result.note).toBe("Too blurry to tell.");
  });

  it("degrades to null rather than guessing when the model returns unparsable output", async () => {
    const provider = fakeAiProviderWith(
      () => ({ text: "unused" }),
      () => ({ text: "That looks like laksa!" }) // not JSON
    );
    const result = await classifyDish("https://example.com/laksa.jpg", provider);
    expect(result.dishName).toBeNull();
  });

  it("passes the image URL through to visionAnalyze", async () => {
    const provider = fakeAiProviderWith(
      () => ({ text: "unused" }),
      () => ({ text: JSON.stringify({ dishName: "Laksa" }) })
    );
    await classifyDish("https://example.com/laksa.jpg", provider);
    expect(provider.visionAnalyzeCalls).toHaveLength(1);
    expect(provider.visionAnalyzeCalls[0]!.image).toEqual({ url: "https://example.com/laksa.jpg" });
  });
});
