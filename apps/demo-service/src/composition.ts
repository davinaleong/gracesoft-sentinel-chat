import { OpenAIProvider } from "@gracesoft-sentinel/provider-ai-openai";
import { GoogleCalendarProvider, createGoogleCalendarClient } from "@gracesoft-sentinel/provider-calendar-google";
import { RedisRateLimiter, RedisSessionStore, createRedisClient } from "@gracesoft-sentinel/provider-session-redis";
import { PostgresConversationLogger, createPgClient } from "@gracesoft-sentinel/logging-postgres";
import { createLogger, type Logger } from "@gracesoft-sentinel/logging";
import { createAgentSwitcher } from "@gracesoft-sentinel/agent-switcher";
import type { NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import { loadBusinessConfig, loadFaqBlueprint } from "./business-config-loader.js";
import { createConciergeOnMessageHandler } from "./concierge-on-message.js";
import { createCookOnMessageHandler } from "./cook-on-message.js";
import type { DemoServiceEnv } from "./env.js";

export interface Composition {
  onMessage: (message: NormalizedMessage) => Promise<NormalizedResponse>;
  readinessCheck: () => Promise<boolean>;
  appLogger: Logger;
}

const RATE_LIMITED_MESSAGE = "You're sending messages a bit quickly — please wait a moment and try again.";

/**
 * The composition root: wires agent-concierge AND agent-cook side by side
 * behind `@gracesoft-sentinel/agent-switcher`, so one channel webhook can
 * demo both. Everything below the switcher is a trimmed, single-tenant
 * echo of apps/concierge-service's / apps/cook-service's own composition —
 * this app can't import those apps directly (apps/* may not depend on each
 * other), so their wiring is re-derived here from the same packages, not
 * shared code.
 */
export function buildComposition(env: DemoServiceEnv): Composition {
  const appLogger = createLogger("demo-service");

  const aiProvider = new OpenAIProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    visionModel: env.OPENAI_VISION_MODEL,
  });

  const calendarClient = createGoogleCalendarClient({
    serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  });
  const businessConfig = loadBusinessConfig(env.BUSINESS_CONFIG_PATH);
  const faqBlueprint = loadFaqBlueprint(env.BUSINESS_CONFIG_PATH, businessConfig);
  const calendarProvider = new GoogleCalendarProvider({ client: calendarClient, businessHours: businessConfig.businessHours });

  const redisClient = createRedisClient(env.REDIS_URL);
  // One shared store for all three concerns (Concierge sessions, Cook
  // sessions, and the switcher's own "which agent is active" state) — safe
  // because each already namespaces its own sessionId ("concierge:...",
  // "cook:...", "switcher:..."), so nothing collides under one keyPrefix.
  const sessionStore = new RedisSessionStore({ client: redisClient, keyPrefix: "gracesoft-sentinel:demo:" });
  // One shared limiter, not one per agent like the two real services use —
  // here it's genuinely the same chatter switching between agents, not two
  // independent products with independent audiences.
  const rateLimiter = new RedisRateLimiter({ client: redisClient, limit: 20, windowSeconds: 60, keyPrefix: "gracesoft-sentinel:demo-ratelimit:" });

  const pgClient = createPgClient(env.DATABASE_URL);
  const conversationLogger = new PostgresConversationLogger({ client: pgClient });

  const conciergeOnMessage = createConciergeOnMessageHandler({
    businessConfig,
    faqBlueprint,
    calendarProvider,
    aiProvider,
    sessionStore,
    conversationLogger,
    appLogger,
  });
  const cookOnMessage = createCookOnMessageHandler({ aiProvider, sessionStore, conversationLogger, appLogger });

  const switcherOnMessage = createAgentSwitcher({
    agents: [
      { name: "concierge", label: "Sentinel Concierge", triggers: ["/concierge", "concierge"], onMessage: conciergeOnMessage },
      { name: "cook", label: "Sentinel Cook", triggers: ["/cook", "cook"], onMessage: cookOnMessage },
    ],
    defaultAgent: env.DEMO_DEFAULT_AGENT,
    sessionStore,
  });

  const onMessage = async (message: NormalizedMessage): Promise<NormalizedResponse> => {
    const { limited } = await rateLimiter.hit(`${message.channel}:${message.senderId}`);
    if (limited) {
      appLogger.warn({ channel: message.channel }, "sender rate limit exceeded");
      return { text: RATE_LIMITED_MESSAGE };
    }
    return switcherOnMessage(message);
  };

  const readinessCheck = async (): Promise<boolean> => {
    await redisClient.get("__healthcheck__");
    await pgClient.query("SELECT 1", []);
    return true;
  };

  return { onMessage, readinessCheck, appLogger };
}
