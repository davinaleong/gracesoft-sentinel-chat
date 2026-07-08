import type { AppModule, AppInput, AppOutput } from "@sentinel/gateway-core";
import type { ConciergeSession } from "./types";
import { handleConcierge } from "./flow";
import { tryConciergeFaq } from "./faq";
import { calendarConfig } from "./config";

const concierge: AppModule<ConciergeSession> = {
  name: "concierge",

  async handle(input: AppInput<ConciergeSession>): Promise<AppOutput<ConciergeSession>> {
    return handleConcierge(input, calendarConfig);
  },

  tryFaq(text: string): { text: string } | null {
    return tryConciergeFaq(text);
  },
};

export default concierge;
export type { ConciergeSession };
