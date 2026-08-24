import type { ConversationState, NormalizedMessage, NormalizedResponse, SessionStore } from "@gracesoft-sentinel/core";

export interface RegisteredAgent {
  /** Stable key, e.g. "concierge" — used internally and in the switch-confirmation message. */
  name: string;
  /** Human-friendly label shown to the chatter, e.g. "Sentinel Concierge". */
  label: string;
  /**
   * Phrases that switch *to* this agent — matched case-insensitively
   * against the chatter's *entire* trimmed message, not a substring search,
   * so an ordinary sentence that happens to contain a trigger word doesn't
   * accidentally switch mid-conversation.
   */
  triggers: string[];
  /**
   * Fully self-contained — already closes over this agent's own
   * session/provider/logging wiring, exactly like what a channel webhook
   * router is normally given. This package never sees any agent's own
   * `ConversationState` or dependencies, only this callback.
   */
  onMessage: (message: NormalizedMessage) => Promise<NormalizedResponse>;
}

export interface AgentSwitcherConfig {
  agents: RegisteredAgent[];
  /** `name` of the agent a chatter talks to before ever explicitly switching. Must be one of `agents`. */
  defaultAgent: string;
  /** Persists which agent is currently active per chatter — deliberately separate from any agent's own session store/key. */
  sessionStore: SessionStore;
  /** Defaults to `switcher:{channel}:{senderId}`; override if that would collide with something else sharing the same SessionStore. */
  sessionIdFor?: (message: NormalizedMessage) => string;
  /** How long the "which agent is active" choice survives with no messages. Defaults to 24h. */
  sessionTtlSeconds?: number;
}

interface SwitcherContext {
  activeAgent?: string;
}

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24;

function defaultSessionIdFor(message: NormalizedMessage): string {
  return `switcher:${message.channel}:${message.senderId}`;
}

function freshState(sessionId: string, message: NormalizedMessage): ConversationState {
  const now = new Date().toISOString();
  return { sessionId, channel: message.channel, userId: message.senderId, agent: "switcher", createdAt: now, updatedAt: now, context: {} };
}

function findTriggeredAgent(agents: RegisteredAgent[], text: string): RegisteredAgent | undefined {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return undefined;
  return agents.find((agent) => agent.triggers.some((trigger) => trigger.toLowerCase() === trimmed));
}

/**
 * Wraps N independently-composed agents (each an already fully
 * self-contained `onMessage` callback) behind *one* `onMessage` a single
 * channel webhook can be pointed at, letting a chatter switch which one
 * they're talking to via a command or passphrase mid-conversation.
 *
 * Deliberately unaware of any specific agent's internals — `agent-concierge`
 * and `agent-cook` stay exactly as ignorant of each other as the boundary
 * lint already requires elsewhere in this monorepo; this package sits one
 * level above both, in the composition layer, not beside them. A trigger
 * match never reaches the active agent at all (it's handled here and
 * confirmed directly), so switching never shows up as a strange message in
 * either agent's own conversation history.
 */
export function createAgentSwitcher(config: AgentSwitcherConfig): (message: NormalizedMessage) => Promise<NormalizedResponse> {
  const sessionIdFor = config.sessionIdFor ?? defaultSessionIdFor;
  const ttlSeconds = config.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  const byName = new Map(config.agents.map((agent) => [agent.name, agent]));
  const defaultAgent = byName.get(config.defaultAgent);
  if (!defaultAgent) {
    throw new Error(`createAgentSwitcher: defaultAgent "${config.defaultAgent}" is not in the agents list`);
  }

  return async (message: NormalizedMessage): Promise<NormalizedResponse> => {
    const sessionId = sessionIdFor(message);
    const state = (await config.sessionStore.get(sessionId)) ?? freshState(sessionId, message);
    const context = state.context as SwitcherContext;

    const triggered = message.text ? findTriggeredAgent(config.agents, message.text) : undefined;
    if (triggered) {
      await config.sessionStore.set(
        { ...state, context: { activeAgent: triggered.name }, updatedAt: new Date().toISOString() },
        ttlSeconds
      );
      return { text: `Switched to ${triggered.label}. Go ahead — say something to get started.` };
    }

    const active = (context.activeAgent && byName.get(context.activeAgent)) || defaultAgent;
    const response = await active.onMessage(message);

    // Re-persist even when nothing changed — same "defense in depth over a
    // merge-based store" reasoning as agent-concierge's withAiDisclosure:
    // silently losing which agent was active is worse than a redundant write.
    await config.sessionStore.set(
      { ...state, context: { activeAgent: active.name }, updatedAt: new Date().toISOString() },
      ttlSeconds
    );

    return response;
  };
}
