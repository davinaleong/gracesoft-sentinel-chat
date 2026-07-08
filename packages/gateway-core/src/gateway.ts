import type { AppModule, GatewayInput, GatewayOutput, AppName } from "./types";
import { SessionManager } from "./session";
import { MENU_TEXT, isMenuEscape, parseMenuSelection } from "./menu";
import { tryGlobalFaq } from "./faq";

export interface Gateway {
  process(input: GatewayInput): Promise<GatewayOutput>;
}

/**
 * Creates a gateway instance with the provided app modules registered.
 * The returned `process()` function is the single entry point for channel shells.
 *
 * @param apps - Array of AppModule implementations (concierge, cook, …).
 */
export function createGateway(apps: AppModule<any>[]): Gateway {
  const sessions = new SessionManager();
  const appMap = new Map<AppName, AppModule<any>>(
    apps.map((a) => [a.name, a])
  );

  return {
    async process(input: GatewayInput): Promise<GatewayOutput> {
      const { from, text, media } = input;
      const session = sessions.get(from);

      // ── 1. Global escape hatch ("menu" / "0") ──────────────────────────
      if (text && isMenuEscape(text)) {
        sessions.clear(from);
        return { to: from, reply: MENU_TEXT };
      }

      // ── 2. Top-level flow (no active app) ──────────────────────────────
      if (!session.activeApp) {
        // Global FAQ
        if (text) {
          const faqMatch = tryGlobalFaq(text);
          if (faqMatch) {
            return { to: from, reply: faqMatch.text };
          }

          // Menu selection ("1" → Concierge, "2" → Cook)
          const selected = parseMenuSelection(text);
          if (selected) {
            session.activeApp = selected;
            sessions.set(from, session);
            // Fall through to app dispatch so the selection triggers an intro
          } else {
            return { to: from, reply: MENU_TEXT };
          }
        } else if (media?.type === "image") {
          // Cold photo → auto-route to Cook
          session.activeApp = "cook";
          sessions.set(from, session);
          // Fall through to app dispatch
        } else {
          return { to: from, reply: MENU_TEXT };
        }
      }

      // ── 3. Dispatch to active app ───────────────────────────────────────
      const app = appMap.get(session.activeApp as AppName);
      if (!app) {
        sessions.clear(from);
        return {
          to: from,
          reply: [`Sorry, that service is currently unavailable.`, MENU_TEXT],
        };
      }

      // Try in-app FAQ before routing to handle()
      if (text) {
        const inAppFaq = app.tryFaq(text);
        if (inAppFaq) {
          return { to: from, reply: inAppFaq.text };
        }
      }

      // Call the app
      const result = await app.handle({
        from,
        text,
        media,
        session: session.appSession,
      });

      // Tear down session on completion
      if (result.status === "done" || result.session === null) {
        sessions.clear(from);
        const replies = Array.isArray(result.reply)
          ? result.reply
          : [result.reply];
        return { to: from, reply: [...replies, MENU_TEXT] };
      }

      // Persist updated app session
      sessions.set(from, {
        activeApp: session.activeApp,
        appSession: result.session as Record<string, unknown>,
      });
      return { to: from, reply: result.reply };
    },
  };
}
