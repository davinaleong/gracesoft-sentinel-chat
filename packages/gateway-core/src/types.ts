/**
 * @sentinel/gateway-core — Shared TypeScript interfaces
 * Single source of truth for all cross-package contracts.
 * All other packages import types from here.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** A channel-qualified user identifier. Format: "<channel>:<id>"
 *  e.g. "whatsapp:6591234567" | "telegram:123456789" */
export type ChannelUserId = string;

/** Supported first-party app names */
export type AppName = "concierge" | "cook";

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

/** An inbound media attachment from a user */
export interface InboundMedia {
  type: "image" | "document" | "audio";
  /** Direct or pre-signed download URL */
  url: string;
  mimeType?: string;
}

// ---------------------------------------------------------------------------
// Channel adapter contract (channel shell ↔ gateway-core)
// ---------------------------------------------------------------------------

/** What a channel shell sends into gateway-core.process() */
export interface GatewayInput {
  from: ChannelUserId;
  text?: string;
  media?: InboundMedia;
}

/** What gateway-core.process() returns to a channel shell */
export interface GatewayOutput {
  to: ChannelUserId;
  /** One or more reply messages to send in sequence */
  reply: string | string[];
}

// ---------------------------------------------------------------------------
// App module contract (gateway-core ↔ app)
// ---------------------------------------------------------------------------

/** What gateway-core passes into an app's handle() */
export interface AppInput<TSession = Record<string, unknown>> {
  from: ChannelUserId;
  text?: string;
  media?: InboundMedia;
  /** App-specific session slice; null on the very first call */
  session: TSession | null;
}

/** What an app's handle() returns to gateway-core */
export interface AppOutput<TSession = Record<string, unknown>> {
  reply: string | string[];
  /** Updated session to persist. null clears the session (same as status "done"). */
  session: TSession | null;
  /** "done" triggers gateway-core to clear the session and show the main menu. */
  status: "active" | "done";
}

/** Contract every app module must satisfy */
export interface AppModule<TSession = Record<string, unknown>> {
  readonly name: AppName;
  handle(input: AppInput<TSession>): Promise<AppOutput<TSession>>;
  /** Returns a FAQ answer if input matches a keyword, otherwise null. */
  tryFaq(text: string): { text: string } | null;
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

/** A single FAQ entry */
export interface FaqEntry {
  /** Lowercase keywords matched via substring against lowercased user input */
  keywords: string[];
  answer: string;
}

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

/** Per-user session record stored in gateway-core's in-memory session store */
export interface UserSession {
  activeApp: AppName | null;
  /** Opaque to gateway-core; owned and interpreted by the active app */
  appSession: Record<string, unknown> | null;
}

/** gateway-core's in-memory session store */
export type SessionStore = Map<ChannelUserId, UserSession>;
