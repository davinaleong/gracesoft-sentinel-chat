import type { AppName } from "./types";

export const MENU_TEXT =
  `Welcome to Sentinel! 🤖\n\n` +
  `Please choose a service:\n` +
  `  1. Concierge — bookings & calendar\n` +
  `  2. Cook — dish photo → recipe + nutrition\n\n` +
  `Reply *1* or *2* to get started.\n` +
  `Type *menu* or *0* at any time to return here.`;

/** Returns true if the text is a global menu escape command. */
export function isMenuEscape(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t === "menu" || t === "0";
}

/**
 * Maps a user's menu reply to an app name.
 * Returns null if the text doesn't match any menu option.
 */
export function parseMenuSelection(text: string): AppName | null {
  const t = text.trim().toLowerCase();
  if (t === "1" || t === "concierge") return "concierge";
  if (t === "2" || t === "cook") return "cook";
  return null;
}
