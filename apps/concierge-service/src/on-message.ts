import { handleMessage, type FaqGroundingBlueprint } from "@gracesoft-sentinel/agent-concierge";
import type { AIProvider, BusinessConfig, CalendarProvider, ConversationState, NormalizedMessage, NormalizedResponse, SessionStore } from "@gracesoft-sentinel/core";
import { redactPii, type Logger } from "@gracesoft-sentinel/logging";
import type { ConversationLogger } from "@gracesoft-sentinel/logging-postgres";
import { withBookingLogging } from "./logging-calendar-provider.js";

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h — long enough to span a slow-to-reply booking flow, short enough not to accumulate forever

export interface OnMessageDeps {
  businessConfig: BusinessConfig;
  faqBlueprint: FaqGroundingBlueprint;
  calendarProvider: CalendarProvider;
  aiProvider: AIProvider;
  sessionStore: SessionStore;
  conversationLogger: ConversationLogger;
  appLogger: Logger;
  sessionTtlSeconds?: number;
}

function sessionIdFor(message: NormalizedMessage): string {
  return `concierge:${message.channel}:${message.senderId}`;
}

function freshState(sessionId: string, message: NormalizedMessage): ConversationState {
  const now = new Date().toISOString();
  return { sessionId, channel: message.channel, userId: message.senderId, agent: "concierge", createdAt: now, updatedAt: now, context: {} };
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

/**
 * Builds the `onMessage` callback both channel webhook routers are given —
 * the actual composition of agent + providers + persistence for this
 * service. Kept as a standalone factory (rather than inlined into server
 * setup) so it's testable against fakes without a running Express app.
 */
export function createOnMessageHandler(deps: OnMessageDeps): (message: NormalizedMessage) => Promise<NormalizedResponse> {
  return async (message: NormalizedMessage): Promise<NormalizedResponse> => {
    const sessionId = sessionIdFor(message);
    const log = deps.appLogger.child({ sessionId });
    const state = (await deps.sessionStore.get(sessionId)) ?? freshState(sessionId, message);

    await logSafely(deps.conversationLogger, log, {
      sessionId,
      channel: message.channel,
      agent: "concierge",
      direction: "inbound",
      text: message.text,
      occurredAt: message.timestamp,
    });

    const result = await handleMessage({
      message,
      state,
      businessConfig: deps.businessConfig,
      calendarProvider: withBookingLogging(deps.calendarProvider, deps.conversationLogger, sessionId, log),
      aiProvider: deps.aiProvider,
      faqBlueprint: deps.faqBlueprint,
    });

    await deps.sessionStore.set(result.state, deps.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS);

    await logSafely(deps.conversationLogger, log, {
      sessionId,
      channel: message.channel,
      agent: "concierge",
      direction: "outbound",
      text: result.response.text,
      occurredAt: new Date().toISOString(),
    });

    log.info("handled message");
    return result.response;
  };
}
