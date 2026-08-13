import { OpenAIProvider } from "@gracesoft-sentinel/provider-ai-openai";
import { RedisSessionStore, createRedisClient } from "@gracesoft-sentinel/provider-session-redis";
import { PostgresConversationLogger, createPgClient } from "@gracesoft-sentinel/logging-postgres";
import type { NormalizedMessage, NormalizedResponse } from "@gracesoft-sentinel/core";
import { createOnMessageHandler } from "./on-message.js";
import type { CookServiceEnv } from "./env.js";

export interface Composition {
  onMessage: (message: NormalizedMessage) => Promise<NormalizedResponse>;
  readinessCheck: () => Promise<boolean>;
}

/** The composition root: wires agent-cook to every provider and persistence layer, purely from env. */
export function buildComposition(env: CookServiceEnv): Composition {
  const aiProvider = new OpenAIProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    visionModel: env.OPENAI_VISION_MODEL,
  });

  const redisClient = createRedisClient(env.REDIS_URL);
  const sessionStore = new RedisSessionStore({ client: redisClient, keyPrefix: "gracesoft-sentinel:cook-session:" });

  const pgClient = createPgClient(env.DATABASE_URL);
  const logger = new PostgresConversationLogger({ client: pgClient });

  const onMessage = createOnMessageHandler({ aiProvider, sessionStore, logger });

  const readinessCheck = async (): Promise<boolean> => {
    await redisClient.get("__healthcheck__");
    await pgClient.query("SELECT 1", []);
    return true;
  };

  return { onMessage, readinessCheck };
}
