import { buildComposition } from "./composition.js";
import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";

const env = loadEnv();
const { onMessage, readinessCheck } = buildComposition(env);
const app = buildServer({ env, onMessage, readinessCheck });

app.listen(env.PORT, () => {
  console.log(`[concierge-service] listening on port ${env.PORT}`);
});
