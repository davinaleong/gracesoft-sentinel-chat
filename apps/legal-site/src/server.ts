import express, { type Express } from "express";
import * as legalConcierge from "@gracesoft-sentinel/legal-concierge";
import * as legalCook from "@gracesoft-sentinel/legal-cook";
import { renderLegalPage } from "./render.js";

/**
 * Renders each agent's Privacy Policy/T&C at its own public route. No auth,
 * no client-side rendering — Meta/Telegram's verification crawlers (and
 * anyone else) must be able to fetch these unauthenticated. Deliberately
 * has zero dependency on `concierge-service`/`cook-service` — it's a
 * separate, independently deployable app, so taking either service down
 * never takes the legal pages down with it.
 */
export function buildServer(): Express {
  const app = express();

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
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

  return app;
}
