import type { AppModule, AppInput, AppOutput } from "@sentinel/gateway-core";
import type { CookSession } from "./types";
import { handleCook } from "./flow";
import { tryCookFaq } from "./faq";
import { cookConfig } from "./config";

const cook: AppModule<CookSession> = {
  name: "cook",

  async handle(input: AppInput<CookSession>): Promise<AppOutput<CookSession>> {
    return handleCook(input, cookConfig.openaiApiKey);
  },

  tryFaq(text: string): { text: string } | null {
    return tryCookFaq(text);
  },
};

export default cook;
export type { CookSession };
