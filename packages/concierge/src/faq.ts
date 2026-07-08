import type { FaqEntry } from "@sentinel/gateway-core";

export const CONCIERGE_FAQ: FaqEntry[] = [
  {
    keywords: ["hours", "opening hours", "open", "when are you"],
    answer:
      "We are available Monday – Friday, 9:00 AM – 5:00 PM (SGT). " +
      "Book a slot by replying *book* or sending a preferred date.",
  },
  {
    keywords: ["location", "where", "address", "office"],
    answer:
      "Our office is at 1 Sentinel Tower, Singapore. " +
      "Once your booking is confirmed, full directions will be sent.",
  },
  {
    keywords: ["cancel", "cancellation", "reschedule"],
    answer:
      "To cancel or reschedule, please contact us directly. " +
      "For a new booking, type *book* or send a preferred date.",
  },
  {
    keywords: ["price", "cost", "fee", "how much"],
    answer:
      "Pricing depends on the service. " +
      "During your appointment, a consultant will walk you through all options.",
  },
];

export function tryConciergeFaq(text: string): { text: string } | null {
  const lower = text.toLowerCase().trim();
  for (const entry of CONCIERGE_FAQ) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return { text: entry.answer };
    }
  }
  return null;
}
