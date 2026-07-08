/**
 * gateway-telegram entry point.
 *
 * Apps (concierge, cook) are wired in here.
 * This file is updated as new app modules become available (M3, M4, M5).
 */
import { createApp } from "./app";
import { config } from "./config";

// Apps will be registered here in M5 Integration:
// import concierge from "@sentinel/concierge";
// import cook from "@sentinel/cook";
// const apps = [concierge, cook];
const apps = [] as never[];

const app = createApp(apps);

app.listen(config.port, () => {
  console.log(`[gateway-telegram] Listening on port ${config.port}`);
});
