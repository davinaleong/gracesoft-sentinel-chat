import type { AIProvider } from "./ai-provider.js";
import { runAIProviderContractTests } from "./ai-provider-contract.js";

/**
 * Trivial fake provider, used only to prove the contract suite itself is
 * correct. The real OpenAI-backed provider is wired up in Milestone 4.
 */
class FakeAIProvider implements AIProvider {
  async chatComplete() {
    return { text: "Hello!" };
  }

  async visionAnalyze() {
    return { text: "This looks like chicken rice." };
  }

  async embed(input: { input: string | string[] }) {
    const items = Array.isArray(input.input) ? input.input : [input.input];
    return { vectors: items.map((item) => [item.length, 1, 0]) };
  }

  async transcribeAudio() {
    return { text: "Can I book a slot for tomorrow at 2pm?" };
  }
}

runAIProviderContractTests("FakeAIProvider (self-test)", () => new FakeAIProvider());
