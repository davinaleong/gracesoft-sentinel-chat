import { describe, expect, it } from "vitest";
import type { ConversationState, NormalizedMessage } from "@gracesoft-sentinel/core";
import { handleMessage } from "./handle-message.js";
import type { CookContext } from "./handle-message.js";
import { fakeAiProviderHappyPath, fakeAiProviderUnidentified, fakeAiProviderWith, fakeAiProviderWithTranscription } from "./test-support.js";

function makeMessage(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    id: "msg-1",
    channel: "whatsapp",
    senderId: "client-1",
    timestamp: new Date().toISOString(),
    raw: {},
    ...overrides,
  };
}

function makeState(context: Record<string, unknown> = {}): ConversationState {
  return {
    sessionId: "session-1",
    channel: "whatsapp",
    userId: "client-1",
    agent: "cook",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    context,
  };
}

function photoMessage(url = "https://example.com/dish.jpg"): NormalizedMessage {
  return makeMessage({ media: [{ type: "image", url }] });
}

describe("handleMessage — dish photo (cold auto-route)", () => {
  it("a clear dish photo infers the correct dish name and returns a full recipe", async () => {
    const result = await handleMessage({
      message: photoMessage(),
      state: makeState(),
      aiProvider: fakeAiProviderHappyPath(),
    });

    expect(result.response.text).toContain("Chicken Rice");
    expect(result.response.text).toContain("Ingredients:");
    expect(result.response.text).toContain("Recipe:");
    expect(result.response.text).toContain("Substitutions:");
    expect(result.response.text).toContain("Serving suggestions:");
    expect((result.state.context as CookContext).lastRecipe?.dishName).toBe("Chicken Rice");
  });

  it("an ambiguous/low-confidence photo gets a fallback response, not a confident wrong guess", async () => {
    const result = await handleMessage({
      message: photoMessage(),
      state: makeState(),
      aiProvider: fakeAiProviderUnidentified("The photo doesn't appear to show food."),
    });

    expect(result.response.text).toContain("couldn't identify");
    expect(result.response.text).not.toContain("Ingredients:");
    expect((result.state.context as CookContext).lastRecipe).toBeUndefined();
  });

  it("a photo overrides any prior awaiting-photo/dietary state", async () => {
    const result = await handleMessage({
      message: photoMessage(),
      state: makeState({ awaitingPhoto: true }),
      aiProvider: fakeAiProviderHappyPath(),
    });
    expect(result.response.text).toContain("Chicken Rice");
  });

  it("degrades gracefully with an apology when the AI call fails", async () => {
    const aiProvider = fakeAiProviderWith(
      () => ({ text: "unused" }),
      () => {
        throw new Error("upstream timeout");
      }
    );
    const result = await handleMessage({ message: photoMessage(), state: makeState(), aiProvider });
    expect(result.response.text).toMatch(/couldn't analyse that photo/i);
  });
});

describe("handleMessage — no photo yet", () => {
  it("first text message (selected via menu) prompts for a photo", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "hi" }),
      state: makeState(),
      aiProvider: fakeAiProviderHappyPath(),
    });
    expect(result.response.text).toMatch(/send me a photo/i);
    expect((result.state.context as CookContext).awaitingPhoto).toBe(true);
  });

  it("text received while awaiting a photo re-prompts rather than guessing", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "here you go" }),
      state: makeState({ awaitingPhoto: true }),
      aiProvider: fakeAiProviderHappyPath(),
    });
    expect(result.response.text).toMatch(/waiting for a dish photo/i);
  });
});

describe("handleMessage — dietary adjustment", () => {
  it("a dietary adjustment request modifies the ingredient list of the last recipe", async () => {
    const vegetarianJson = JSON.stringify({
      dishName: "Chicken Rice",
      servings: 2,
      ingredients: ["tofu", "jasmine rice", "garlic", "ginger"],
      steps: ["Cook tofu.", "Cook rice.", "Serve together."],
      substitutions: [],
      servingSuggestions: [],
      nutrition: { calories: 400, protein: "15g", carbohydrates: "60g", fat: "10g", fiber: "3g" },
    });
    const aiProvider = fakeAiProviderWith(
      () => ({ text: vegetarianJson }),
      () => ({ text: "unused" })
    );

    const lastRecipe = {
      dishName: "Chicken Rice",
      servings: 2,
      ingredients: ["2 chicken thighs", "jasmine rice", "garlic", "ginger"],
      steps: ["Poach chicken.", "Cook rice.", "Serve together."],
      substitutions: [],
      servingSuggestions: [],
      nutrition: { calories: 550, protein: "35g", carbohydrates: "60g", fat: "15g", fiber: "2g" },
    };

    const result = await handleMessage({
      message: makeMessage({ text: "can you make it vegetarian?" }),
      state: makeState({ lastRecipe }),
      aiProvider,
    });

    expect(result.response.text).toContain("tofu");
    expect(result.response.text).not.toContain("chicken thighs");
    expect((result.state.context as CookContext).lastRecipe?.ingredients).toContain("tofu");
  });

  it("a non-dietary follow-up after a recipe re-prompts for a photo instead", async () => {
    const lastRecipe = {
      dishName: "Chicken Rice",
      servings: 2,
      ingredients: ["chicken", "rice"],
      steps: ["Cook."],
      substitutions: [],
      servingSuggestions: [],
      nutrition: { calories: 500, protein: "30g", carbohydrates: "60g", fat: "12g", fiber: "2g" },
    };
    const result = await handleMessage({
      message: makeMessage({ text: "thanks!" }),
      state: makeState({ lastRecipe }),
      aiProvider: fakeAiProviderHappyPath(),
    });
    expect(result.response.text).toMatch(/send me a photo/i);
  });
});

describe("handleMessage — voice notes", () => {
  function voiceMessage(url = "https://example.com/voice-note.ogg"): NormalizedMessage {
    return makeMessage({ media: [{ type: "audio", url }] });
  }

  it("a spoken dietary adjustment transcribes and modifies the last recipe, same as typed text", async () => {
    const lastRecipe = {
      dishName: "Chicken Rice",
      servings: 2,
      ingredients: ["2 chicken thighs", "jasmine rice"],
      steps: ["Poach chicken.", "Cook rice."],
      substitutions: [],
      servingSuggestions: [],
      nutrition: { calories: 550, protein: "35g", carbohydrates: "60g", fat: "15g", fiber: "2g" },
    };
    const vegetarianJson = JSON.stringify({
      dishName: "Chicken Rice",
      servings: 2,
      ingredients: ["tofu", "jasmine rice"],
      steps: ["Cook tofu.", "Cook rice."],
      substitutions: [],
      servingSuggestions: [],
      nutrition: { calories: 400, protein: "15g", carbohydrates: "60g", fat: "10g", fiber: "3g" },
    });
    const aiProvider = fakeAiProviderWith(
      () => ({ text: vegetarianJson }),
      () => ({ text: "unused" })
    );
    aiProvider.transcribeAudio = async () => ({ text: "can you make it vegetarian?" });

    const result = await handleMessage({ message: voiceMessage(), state: makeState({ lastRecipe }), aiProvider });

    expect(result.response.text).toContain("tofu");
    expect((result.state.context as CookContext).lastRecipe?.ingredients).toContain("tofu");
  });

  it("a voice note with no prior recipe and no dietary keywords falls through to prompting for a photo", async () => {
    const aiProvider = fakeAiProviderWithTranscription("hello there");
    const result = await handleMessage({ message: voiceMessage(), state: makeState(), aiProvider });
    expect(aiProvider.transcribeAudioCalls).toEqual([{ audio: { url: "https://example.com/voice-note.ogg" } }]);
    expect(result.response.text).toMatch(/send me a photo/i);
  });

  it("degrades gracefully, without a silent failure, when transcription itself fails", async () => {
    const aiProvider = fakeAiProviderHappyPath();
    aiProvider.transcribeAudio = async () => {
      throw new Error("upstream transcription service down");
    };
    const result = await handleMessage({ message: voiceMessage(), state: makeState(), aiProvider });
    expect(result.response.text).toMatch(/couldn't process that voice note/i);
  });

  it("a photo takes priority over a voice note if a message somehow carries both", async () => {
    const message = makeMessage({
      media: [
        { type: "image", url: "https://example.com/dish.jpg" },
        { type: "audio", url: "https://example.com/voice-note.ogg" },
      ],
    });
    const aiProvider = fakeAiProviderHappyPath();
    const result = await handleMessage({ message, state: makeState(), aiProvider });
    expect(aiProvider.transcribeAudioCalls).toHaveLength(0);
    expect(result.response.text).toContain("Chicken Rice");
  });
});
