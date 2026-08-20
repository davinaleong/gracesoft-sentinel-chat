import { OpenAIProvider } from "@gracesoft-sentinel/provider-ai-openai";
import { GoogleCalendarProvider, createGoogleCalendarClient, type GoogleCalendarClient } from "@gracesoft-sentinel/provider-calendar-google";
import { RedisRateLimiter, RedisSessionStore, createRedisClient } from "@gracesoft-sentinel/provider-session-redis";
import { PostgresConversationLogger, createPgClient } from "@gracesoft-sentinel/logging-postgres";
import { createLogger, type Logger } from "@gracesoft-sentinel/logging";
import type { NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import { loadBusinessConfig, loadBusinessConfigRegistry, loadFaqBlueprint } from "./business-config-loader.js";
import { createOnMessageHandler, type TenantContext } from "./on-message.js";
import type { ConciergeServiceEnv } from "./env.js";

/**
 * Builds the per-message tenant lookup. Multi-tenant (`BUSINESS_CONFIGS_DIR`
 * set) builds a `TenantContext` per business, all sharing one
 * `GoogleCalendarClient` (the calendar API doesn't care which business a
 * request is for — only `calendarId` and `businessHours`, both already
 * per-`BusinessConfig`, do). Single-tenant mode (`BUSINESS_CONFIG_PATH`)
 * always resolves to the same one config regardless of `businessChannelId`,
 * preserving the pre-multi-tenancy behavior.
 */
function buildTenantResolver(env: ConciergeServiceEnv, calendarClient: GoogleCalendarClient): (message: NormalizedMessage) => TenantContext | undefined {
  if (env.BUSINESS_CONFIGS_DIR) {
    const registry = loadBusinessConfigRegistry(env.BUSINESS_CONFIGS_DIR);
    const tenants = new Map<string, TenantContext>();
    for (const [businessChannelId, { businessConfig, faqBlueprint }] of registry) {
      tenants.set(businessChannelId, {
        businessConfig,
        faqBlueprint,
        calendarProvider: new GoogleCalendarProvider({ client: calendarClient, businessHours: businessConfig.businessHours }),
      });
    }
    return (message) => (message.businessChannelId ? tenants.get(message.businessChannelId) : undefined);
  }

  const businessConfig = loadBusinessConfig(env.BUSINESS_CONFIG_PATH!);
  const faqBlueprint = loadFaqBlueprint(env.BUSINESS_CONFIG_PATH!, businessConfig);
  const tenant: TenantContext = {
    businessConfig,
    faqBlueprint,
    calendarProvider: new GoogleCalendarProvider({ client: calendarClient, businessHours: businessConfig.businessHours }),
  };
  return () => tenant;
}

export interface Composition {
  onMessage: (message: NormalizedMessage) => Promise<NormalizedResponse>;
  readinessCheck: () => Promise<boolean>;
  appLogger: Logger;
}

/** The composition root: wires agent-concierge to every provider and persistence layer, purely from env. */
export function buildComposition(env: ConciergeServiceEnv): Composition {
  const appLogger = createLogger("concierge-service");

  const aiProvider = new OpenAIProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    visionModel: env.OPENAI_VISION_MODEL,
  });

  const calendarClient = createGoogleCalendarClient({
    serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  });
  const resolveTenant = buildTenantResolver(env, calendarClient);

  const redisClient = createRedisClient(env.REDIS_URL);
  const sessionStore = new RedisSessionStore({ client: redisClient });
  // 20 messages/minute per chatter — generous for a real conversation
  // (including a multi-turn booking flow), tight enough to blunt a flood.
  const rateLimiter = new RedisRateLimiter({ client: redisClient, limit: 20, windowSeconds: 60 });

  const pgClient = createPgClient(env.DATABASE_URL);
  const conversationLogger = new PostgresConversationLogger({ client: pgClient });

  const onMessage = createOnMessageHandler({
    resolveTenant,
    aiProvider,
    sessionStore,
    conversationLogger,
    appLogger,
    rateLimiter,
  });

  const readinessCheck = async (): Promise<boolean> => {
    await redisClient.get("__healthcheck__");
    await pgClient.query("SELECT 1", []);
    return true;
  };

  return { onMessage, readinessCheck, appLogger };
}
