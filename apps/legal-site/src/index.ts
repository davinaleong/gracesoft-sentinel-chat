import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";

const env = loadEnv();
const app = buildServer();

app.listen(env.PORT, () => {
  console.log(`[legal-site] listening on port ${env.PORT}`);
});
