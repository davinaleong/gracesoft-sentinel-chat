import type {
  AIProvider,
  ChatCompleteInput,
  ChatCompleteResult,
  EmbedInput,
  EmbedResult,
  VisionAnalyzeInput,
  VisionAnalyzeResult,
} from "@gracesoft-sentinel/core";

class FakeAiProvider implements AIProvider {
  public chatCompleteCalls: ChatCompleteInput[] = [];
  public visionAnalyzeCalls: VisionAnalyzeInput[] = [];

  constructor(
    private readonly makeChatResult: (input: ChatCompleteInput) => ChatCompleteResult,
    private readonly makeVisionResult: (input: VisionAnalyzeInput) => VisionAnalyzeResult
  ) {}

  async chatComplete(input: ChatCompleteInput): Promise<ChatCompleteResult> {
    this.chatCompleteCalls.push(input);
    return this.makeChatResult(input);
  }

  async visionAnalyze(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    this.visionAnalyzeCalls.push(input);
    return this.makeVisionResult(input);
  }

  async embed(_input: EmbedInput): Promise<EmbedResult> {
    throw new Error("FakeAiProvider.embed is not implemented — not needed by these tests");
  }
}

export type { FakeAiProvider };

const DEFAULT_RECIPE_JSON = JSON.stringify({
  dishName: "Chicken Rice",
  servings: 2,
  ingredients: ["2 chicken thighs", "2 cups jasmine rice", "3 cloves garlic", "1 thumb ginger"],
  steps: ["Poach the chicken.", "Cook rice in the poaching stock.", "Slice chicken and serve with rice."],
  substitutions: ["Swap chicken thighs for tofu for a vegetarian version."],
  servingSuggestions: ["Serve with cucumber slices and chilli-ginger sauce."],
  nutrition: { calories: 550, protein: "35g", carbohydrates: "60g", fat: "15g", fiber: "2g" },
});

/** Vision call returns a confident dish name; chat call returns a well-formed recipe. */
export function fakeAiProviderHappyPath(): FakeAiProvider {
  return new FakeAiProvider(
    () => ({ text: DEFAULT_RECIPE_JSON }),
    () => ({ text: JSON.stringify({ dishName: "Chicken Rice", note: undefined }) })
  );
}

/** Vision call can't confidently identify a dish. */
export function fakeAiProviderUnidentified(note = "The photo doesn't appear to show food."): FakeAiProvider {
  return new FakeAiProvider(
    () => ({ text: DEFAULT_RECIPE_JSON }),
    () => ({ text: JSON.stringify({ dishName: null, note }) })
  );
}

/** Fully scriptable fake, for tests that need to control both calls precisely. */
export function fakeAiProviderWith(
  makeChatResult: (input: ChatCompleteInput) => ChatCompleteResult,
  makeVisionResult: (input: VisionAnalyzeInput) => VisionAnalyzeResult
): FakeAiProvider {
  return new FakeAiProvider(makeChatResult, makeVisionResult);
}
