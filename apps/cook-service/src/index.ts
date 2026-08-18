import { buildComposition } from "./composition.js";
import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";

const env = loadEnv();
const { onMessage, readinessCheck, appLogger } = buildComposition(env);
const app = buildServer({ env, onMessage, readinessCheck, appLogger });

app.listen(env.PORT, () => {
  appLogger.info({ port: env.PORT }, "cook-service listening");
});
