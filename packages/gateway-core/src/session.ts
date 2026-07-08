import type { ChannelUserId, UserSession, SessionStore } from "./types";

/**
 * In-memory session manager.
 * Keyed by channel-qualified user ID (e.g. "whatsapp:6591234567").
 */
export class SessionManager {
  private readonly store: SessionStore = new Map();

  /** Returns the session for a user, creating a blank one if it doesn't exist. */
  get(userId: ChannelUserId): UserSession {
    if (!this.store.has(userId)) {
      this.store.set(userId, { activeApp: null, appSession: null });
    }
    return this.store.get(userId)!;
  }

  /** Overwrites the session for a user. */
  set(userId: ChannelUserId, session: UserSession): void {
    this.store.set(userId, session);
  }

  /** Resets the session for a user to a blank state (no active app). */
  clear(userId: ChannelUserId): void {
    this.store.set(userId, { activeApp: null, appSession: null });
  }
}
