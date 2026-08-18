import { handleMessage } from "@gracesoft-sentinel/agent-cook";
import type { AIProvider, ConversationState, NormalizedMessage, NormalizedResponse, SessionStore } from "@gracesoft-sentinel/core";
import { redactPii, type Logger } from "@gracesoft-sentinel/logging";
import type { ConversationLogger } from "@gracesoft-sentinel/logging-postgres";

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60; // 1h — Cook's flow is single-photo-in, single-recipe-out; short-lived by design

export interface OnMessageDeps {
  aiProvider: AIProvider;
  sessionStore: SessionStore;
  conversationLogger: ConversationLogger;
  appLogger: Logger;
  sessionTtlSeconds?: number;
}

function sessionIdFor(message: NormalizedMessage): string {
  return `cook:${message.channel}:${message.senderId}`;
}

function freshState(sessionId: string, message: NormalizedMessage): ConversationState {
  const now = new Date().toISOString();
  return { sessionId, channel: message.channel, userId: message.senderId, agent: "cook", createdAt: now, updatedAt: now, context: {} };
}

async function logSafely(
  conversationLogger: ConversationLogger,
  appLogger: Logger,
  entry: Parameters<ConversationLogger["logMessage"]>[0]
): Promise<void> {
  try {
    await conversationLogger.logMessage({ ...entry, text: entry.text ? redactPii(entry.text) : entry.text });
  } catch (err) {
    appLogger.error({ err, sessionId: entry.sessionId }, "failed to log conversation message");
  }
}

/** Builds the `onMessage` callback both channel webhook routers are given — see concierge-service's equivalent for the design rationale. */
export function createOnMessageHandler(deps: OnMessageDeps): (message: NormalizedMessage) => Promise<NormalizedResponse> {
  return async (message: NormalizedMessage): Promise<NormalizedResponse> => {
    const sessionId = sessionIdFor(message);
    const log = deps.appLogger.child({ sessionId });
    const state = (await deps.sessionStore.get(sessionId)) ?? freshState(sessionId, message);

    await logSafely(deps.conversationLogger, log, {
      sessionId,
      channel: message.channel,
      agent: "cook",
      direction: "inbound",
      text: message.text ?? (message.media?.length ? "[photo]" : undefined),
      occurredAt: message.timestamp,
    });

    const result = await handleMessage({ message, state, aiProvider: deps.aiProvider });

    await deps.sessionStore.set(result.state, deps.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS);

    await logSafely(deps.conversationLogger, log, {
      sessionId,
      channel: message.channel,
      agent: "cook",
      direction: "outbound",
      text: result.response.text,
      occurredAt: new Date().toISOString(),
    });

    log.info("handled message");
    return result.response;
  };
}
