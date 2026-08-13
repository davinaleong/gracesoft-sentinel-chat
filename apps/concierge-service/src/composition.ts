import { OpenAIProvider } from "@gracesoft-sentinel/provider-ai-openai";
import { GoogleCalendarProvider, createGoogleCalendarClient } from "@gracesoft-sentinel/provider-calendar-google";
import { RedisSessionStore, createRedisClient } from "@gracesoft-sentinel/provider-session-redis";
import { PostgresConversationLogger, createPgClient } from "@gracesoft-sentinel/logging-postgres";
import type { NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import { loadBusinessConfig, loadFaqBlueprint } from "./business-config-loader.js";
import { createOnMessageHandler } from "./on-message.js";
import type { ConciergeServiceEnv } from "./env.js";

export interface Composition {
  onMessage: (message: NormalizedMessage) => Promise<NormalizedResponse>;
  readinessCheck: () => Promise<boolean>;
}

/** The composition root: wires agent-concierge to every provider and persistence layer, purely from env. */
export function buildComposition(env: ConciergeServiceEnv): Composition {
  const businessConfig = loadBusinessConfig(env.BUSINESS_CONFIG_PATH);
  const faqBlueprint = loadFaqBlueprint(env.BUSINESS_CONFIG_PATH, businessConfig);

  const aiProvider = new OpenAIProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    visionModel: env.OPENAI_VISION_MODEL,
  });

  const calendarClient = createGoogleCalendarClient({
    serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  });
  const calendarProvider = new GoogleCalendarProvider({ client: calendarClient, businessHours: businessConfig.businessHours });

  const redisClient = createRedisClient(env.REDIS_URL);
  const sessionStore = new RedisSessionStore({ client: redisClient });

  const pgClient = createPgClient(env.DATABASE_URL);
  const logger = new PostgresConversationLogger({ client: pgClient });

  const onMessage = createOnMessageHandler({ businessConfig, faqBlueprint, calendarProvider, aiProvider, sessionStore, logger });

  const readinessCheck = async (): Promise<boolean> => {
    await redisClient.get("__healthcheck__");
    await pgClient.query("SELECT 1", []);
    return true;
  };

  return { onMessage, readinessCheck };
}
