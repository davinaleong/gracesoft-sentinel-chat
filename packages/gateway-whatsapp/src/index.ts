/**
 * gateway-whatsapp entry point.
 * Registers Concierge and Cook with the gateway.
 */
import { createApp } from "./app";
import { config } from "./config";
import concierge from "@sentinel/concierge";
import cook from "@sentinel/cook";

const app = createApp([concierge, cook]);

app.listen(config.port, () => {
  console.log(
    `[gateway-whatsapp] Listening on port ${config.port}`
  );
});
