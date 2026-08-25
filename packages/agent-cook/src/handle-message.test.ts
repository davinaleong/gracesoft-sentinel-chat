import { describe, expect, it } from "vitest";
import type { ConversationState, NormalizedMessage } from "@gracesoft-sentinel/core";
import { handleMessage } from "./handle-message.js";
import type { CookContext } from "./handle-message.js";
import {
  fakeAiProviderHappyPath,
  fakeAiProviderUnidentified,
  fakeAiProviderWith,
  fakeAiProviderWithTranscription,
  FakeRecipeSourceProvider,
  fakeRecipeSourceProviderThatFails,
  fakeRecipeSourceProviderThatFailsToList,
} from "./test-support.js";

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

describe("handleMessage — grocery list / meal plan", () => {
  it("accumulates recentRecipes across successive photo messages, capped at 7", async () => {
    let state = makeState();
    const aiProvider = fakeAiProviderHappyPath();
    for (let i = 0; i < 9; i++) {
      const result = await handleMessage({ message: photoMessage(), state, aiProvider });
      state = result.state;
    }
    expect((state.context as CookContext).recentRecipes).toHaveLength(7);
  });

  it("a grocery-list request combines recent recipes' ingredients into a consolidated list", async () => {
    const recentRecipes = [
      {
        dishName: "Chicken Rice",
        servings: 2,
        ingredients: ["2 chicken thighs", "2 cloves garlic"],
        steps: ["Cook."],
        substitutions: [],
        servingSuggestions: [],
        nutrition: { calories: 550, protein: "35g", carbohydrates: "60g", fat: "15g", fiber: "2g" },
      },
      {
        dishName: "Laksa",
        servings: 2,
        ingredients: ["laksa paste", "2 cloves garlic"],
        steps: ["Cook."],
        substitutions: [],
        servingSuggestions: [],
        nutrition: { calories: 620, protein: "20g", carbohydrates: "70g", fat: "28g", fiber: "3g" },
      },
    ];
    const consolidatedJson = JSON.stringify({ items: ["2 chicken thighs", "4 cloves garlic", "laksa paste"] });
    const aiProvider = fakeAiProviderWith(
      () => ({ text: consolidatedJson }),
      () => ({ text: "unused" })
    );

    const result = await handleMessage({
      message: makeMessage({ text: "can you give me a grocery list for these?" }),
      state: makeState({ recentRecipes }),
      aiProvider,
    });

    expect(result.response.text).toContain("Chicken Rice, Laksa");
    expect(result.response.text).toContain("- 4 cloves garlic");
  });

  it("a grocery-list request with no recent recipes falls through to prompting for a photo instead", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "give me a grocery list" }),
      state: makeState(),
      aiProvider: fakeAiProviderHappyPath(),
    });
    expect(result.response.text).toMatch(/send me a photo/i);
  });

  it("degrades gracefully, without a silent failure, when grocery-list generation fails", async () => {
    const recentRecipes = [
      {
        dishName: "Chicken Rice",
        servings: 2,
        ingredients: ["chicken"],
        steps: ["Cook."],
        substitutions: [],
        servingSuggestions: [],
        nutrition: { calories: 550, protein: "35g", carbohydrates: "60g", fat: "15g", fiber: "2g" },
      },
    ];
    const aiProvider = fakeAiProviderWith(
      () => ({ text: "not json" }),
      () => ({ text: "unused" })
    );
    const result = await handleMessage({
      message: makeMessage({ text: "shopping list please" }),
      state: makeState({ recentRecipes }),
      aiProvider,
    });
    expect(result.response.text).toMatch(/couldn't put that grocery list together/i);
  });
});

describe("handleMessage — personal recipe (Mother's Day Edition)", () => {
  it("finds and returns a matching personal recipe when a recipeSourceProvider is configured", async () => {
    const recipeSourceProvider = new FakeRecipeSourceProvider([
      { id: "1", title: "Mom's Chicken Curry", raw: { content: "Simmer the chicken for 40 minutes with coconut milk." } },
    ]);

    const result = await handleMessage({
      message: makeMessage({ text: "do you have my mom's recipe for chicken curry?" }),
      state: makeState(),
      aiProvider: fakeAiProviderHappyPath(),
      recipeSourceProvider,
    });

    expect(result.response.text).toContain("Mom's Chicken Curry");
    expect(result.response.text).toContain("Simmer the chicken for 40 minutes");
    expect(recipeSourceProvider.findRecipesCalls).toHaveLength(1);
  });

  it("falls back to the photo prompt when no recipeSourceProvider is configured and the phrasing doesn't also match free recipe search", async () => {
    // Deliberately possessive-only phrasing ("my mom's X recipe", dish name
    // before "recipe") — no "recipe for X" / "how to make X" anywhere, so
    // this doesn't also satisfy the free-search path below; it's isolating
    // "no provider configured" from "the phrasing is generically searchable".
    const result = await handleMessage({
      message: makeMessage({ text: "do you have my mom's chicken curry recipe?" }),
      state: makeState(),
      aiProvider: fakeAiProviderHappyPath(),
    });
    expect(result.response.text).toMatch(/send me a photo/i);
  });

  it("replies with a not-found message, without a silent failure, when nothing matches", async () => {
    const recipeSourceProvider = new FakeRecipeSourceProvider([]);
    const result = await handleMessage({
      message: makeMessage({ text: "my family recipe for popiah" }),
      state: makeState(),
      aiProvider: fakeAiProviderHappyPath(),
      recipeSourceProvider,
    });
    expect(result.response.text).toMatch(/couldn't find a matching recipe/i);
  });

  it("degrades gracefully, without a silent failure, when the lookup itself fails", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "my mom's recipe for laksa" }),
      state: makeState(),
      aiProvider: fakeAiProviderHappyPath(),
      recipeSourceProvider: fakeRecipeSourceProviderThatFails(),
    });
    expect(result.response.text).toMatch(/couldn't search your saved recipes/i);
  });
});

describe("handleMessage — free recipe search (no personal source involved)", () => {
  it("generates a generic recipe from a 'recipe for X' phrase, with no recipeSourceProvider configured", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "recipe for chicken noodle soup" }),
      state: makeState(),
      aiProvider: fakeAiProviderHappyPath(),
    });
    expect(result.response.text).toContain("Chicken Rice");
    expect(result.response.text).toContain("Ingredients:");
    expect((result.state.context as CookContext).lastRecipe?.dishName).toBe("Chicken Rice");
  });

  it("asks the model for a home-style recipe, not the generic 'provide the full recipe' prompt", async () => {
    const aiProvider = fakeAiProviderHappyPath();
    await handleMessage({
      message: makeMessage({ text: "how do I make a beef stew" }),
      state: makeState(),
      aiProvider,
    });
    const userMessage = aiProvider.chatCompleteCalls[0]!.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain("beef stew");
    expect(userMessage).toMatch(/home-style/i);
  });

  it("still prefers the personal-source lookup over free search when the phrasing is possessive and a recipeSourceProvider is configured", async () => {
    const recipeSourceProvider = new FakeRecipeSourceProvider([
      { id: "1", title: "Mom's Chicken Noodle Soup", raw: { content: "Simmer for 30 minutes." } },
    ]);
    const result = await handleMessage({
      message: makeMessage({ text: "my mom's recipe for chicken noodle soup" }),
      state: makeState(),
      aiProvider: fakeAiProviderHappyPath(),
      recipeSourceProvider,
    });
    expect(result.response.text).toContain("Mom's Chicken Noodle Soup");
    expect(recipeSourceProvider.findRecipesCalls).toHaveLength(1);
  });

  it("degrades gracefully, without a silent failure, when generation itself fails", async () => {
    const aiProvider = fakeAiProviderWith(
      () => {
        throw new Error("upstream timeout");
      },
      () => ({ text: "unused" })
    );
    const result = await handleMessage({
      message: makeMessage({ text: "recipe for pad thai" }),
      state: makeState(),
      aiProvider,
    });
    expect(result.response.text).toMatch(/couldn't come up with a recipe/i);
  });

  it("falls through to the photo prompt for text that isn't a recipe-search phrase", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "what are your hours?" }),
      state: makeState(),
      aiProvider: fakeAiProviderHappyPath(),
    });
    expect(result.response.text).toMatch(/send me a photo/i);
  });
});

describe("handleMessage — recipe list/count", () => {
  it("lists every recipe when a recipeSourceProvider with listRecipes is configured", async () => {
    const recipeSourceProvider = new FakeRecipeSourceProvider(
      [],
      [
        { id: "1", title: "Mom's Chicken Curry" },
        { id: "2", title: "Grandma's Beef Stew" },
      ]
    );

    const result = await handleMessage({
      message: makeMessage({ text: "how many recipes do I have?" }),
      state: makeState(),
      aiProvider: fakeAiProviderHappyPath(),
      recipeSourceProvider,
    });

    expect(result.response.text).toContain("You have 2 saved recipes");
    expect(result.response.text).toContain("Mom's Chicken Curry");
    expect(result.response.text).toContain("Grandma's Beef Stew");
    expect(recipeSourceProvider.listRecipesCalls).toBe(1);
  });

  it("replies with a no-recipes message rather than an empty list", async () => {
    const recipeSourceProvider = new FakeRecipeSourceProvider([], []);
    const result = await handleMessage({
      message: makeMessage({ text: "list my recipes" }),
      state: makeState(),
      aiProvider: fakeAiProviderHappyPath(),
      recipeSourceProvider,
    });
    expect(result.response.text).toMatch(/don't have any saved recipes/i);
  });

  it("falls through to the photo prompt when the configured provider can't enumerate its corpus (no listRecipes)", async () => {
    const recipeSourceProvider = new FakeRecipeSourceProvider([]);
    const result = await handleMessage({
      message: makeMessage({ text: "how many recipes do I have?" }),
      state: makeState(),
      aiProvider: fakeAiProviderHappyPath(),
      recipeSourceProvider,
    });
    expect(result.response.text).toMatch(/send me a photo/i);
  });

  it("degrades gracefully, without a silent failure, when listing itself fails", async () => {
    const result = await handleMessage({
      message: makeMessage({ text: "what recipes do i have" }),
      state: makeState(),
      aiProvider: fakeAiProviderHappyPath(),
      recipeSourceProvider: fakeRecipeSourceProviderThatFailsToList(),
    });
    expect(result.response.text).toMatch(/couldn't list your saved recipes/i);
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
