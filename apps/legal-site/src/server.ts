import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import * as legalConcierge from "@gracesoft-sentinel/legal-concierge";
import * as legalCook from "@gracesoft-sentinel/legal-cook";
import * as legalDemo from "@gracesoft-sentinel/legal-demo";
import { renderLegalPage } from "./render.js";

// `assets/` sits alongside `src`/`dist` (not inside either), since it's a
// binary file with nothing for `tsc` to compile — resolved from this
// module's own location so it works both from `src` (ts-node/dev) and
// `dist` (the built/deployed form) without a separate copy step.
const FAVICON_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "favicon.png");

/**
 * Renders each agent's Privacy Policy/T&C at its own public route. No auth,
 * no client-side rendering — Meta/Telegram's verification crawlers (and
 * anyone else) must be able to fetch these unauthenticated. Deliberately
 * has zero dependency on `concierge-service`/`cook-service`/`demo-service`
 * — it's a separate, independently deployable app, so taking any one of
 * them down never takes the legal pages down with it.
 */
export function buildServer(): Express {
  const app = express();

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/favicon.png", (_req, res) => {
    res.sendFile(FAVICON_PATH);
  });

  app.get("/concierge/privacy", (_req, res) => {
    res.status(200).type("html").send(renderLegalPage("Sentinel Concierge — Privacy Policy", legalConcierge.loadPrivacyPolicy()));
  });

  app.get("/concierge/terms", (_req, res) => {
    res.status(200).type("html").send(renderLegalPage("Sentinel Concierge — Terms & Conditions", legalConcierge.loadTerms()));
  });

  app.get("/cook/privacy", (_req, res) => {
    res.status(200).type("html").send(renderLegalPage("Sentinel Cook — Privacy Policy", legalCook.loadPrivacyPolicy()));
  });

  app.get("/cook/terms", (_req, res) => {
    res.status(200).type("html").send(renderLegalPage("Sentinel Cook — Terms & Conditions", legalCook.loadTerms()));
  });

  app.get("/demo/privacy", (_req, res) => {
    res.status(200).type("html").send(renderLegalPage("Sentinel Demo — Privacy Policy", legalDemo.loadPrivacyPolicy()));
  });

  app.get("/demo/terms", (_req, res) => {
    res.status(200).type("html").send(renderLegalPage("Sentinel Demo — Terms & Conditions", legalDemo.loadTerms()));
  });

  return app;
}
