import { OpenAIProvider } from "@gracesoft-sentinel/provider-ai-openai";
import { RedisSessionStore, createRedisClient } from "@gracesoft-sentinel/provider-session-redis";
import { PostgresConversationLogger, createPgClient } from "@gracesoft-sentinel/logging-postgres";
import { createLogger, type Logger } from "@gracesoft-sentinel/logging";
import { GoogleDriveRecipeProvider, createGoogleDriveClient } from "@gracesoft-sentinel/provider-drive-google";
import type { AIProvider, NormalizedMessage, NormalizedResponse, RecipeSourceProvider } from "@gracesoft-sentinel/core";
import { createOnMessageHandler } from "./on-message.js";
import type { CookServiceEnv } from "./env.js";

export interface Composition {
  onMessage: (message: NormalizedMessage) => Promise<NormalizedResponse>;
  readinessCheck: () => Promise<boolean>;
  appLogger: Logger;
}

/**
 * "Mother's Day Edition" (Milestone 11) — fully opt-in. Only constructed
 * when GOOGLE_DRIVE_RECIPES_FOLDER_ID is set (env.ts's superRefine already
 * guarantees the Google service-account vars are present whenever it is);
 * every other deployment gets `undefined` and agent-cook's photo-based flow
 * is entirely unaffected.
 */
function buildRecipeSourceProvider(env: CookServiceEnv, aiProvider: AIProvider): RecipeSourceProvider | undefined {
  if (!env.GOOGLE_DRIVE_RECIPES_FOLDER_ID) return undefined;

  const client = createGoogleDriveClient({
    serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    privateKey: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!,
  });
  return new GoogleDriveRecipeProvider({ client, aiProvider, folderId: env.GOOGLE_DRIVE_RECIPES_FOLDER_ID });
}

/** The composition root: wires agent-cook to every provider and persistence layer, purely from env. */
export function buildComposition(env: CookServiceEnv): Composition {
  const appLogger = createLogger("cook-service");

  const aiProvider = new OpenAIProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    visionModel: env.OPENAI_VISION_MODEL,
  });

  const recipeSourceProvider = buildRecipeSourceProvider(env, aiProvider);

  const redisClient = createRedisClient(env.REDIS_URL);
  const sessionStore = new RedisSessionStore({ client: redisClient, keyPrefix: "gracesoft-sentinel:cook-session:" });

  const pgClient = createPgClient(env.DATABASE_URL);
  const conversationLogger = new PostgresConversationLogger({ client: pgClient });

  const onMessage = createOnMessageHandler({ aiProvider, sessionStore, conversationLogger, appLogger, recipeSourceProvider });

  const readinessCheck = async (): Promise<boolean> => {
    await redisClient.get("__healthcheck__");
    await pgClient.query("SELECT 1", []);
    return true;
  };

  return { onMessage, readinessCheck, appLogger };
}
