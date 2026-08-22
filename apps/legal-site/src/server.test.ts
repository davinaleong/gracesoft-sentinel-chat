import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPrivacyPolicy as loadConciergePrivacy, loadTerms as loadConciergeTerms } from "@gracesoft-sentinel/legal-concierge";
import { loadPrivacyPolicy as loadCookPrivacy, loadTerms as loadCookTerms } from "@gracesoft-sentinel/legal-cook";
import { buildServer } from "./server.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = buildServer();
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server.close();
});

describe("legal-site — reachability", () => {
  it("GET /health returns ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
  });

  it("GET /favicon.png returns the icon, unauthenticated", async () => {
    const res = await fetch(`${baseUrl}/favicon.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
  });

  it.each([
    ["/concierge/privacy"],
    ["/concierge/terms"],
    ["/cook/privacy"],
    ["/cook/terms"],
  ])("%s returns 200 HTML, unauthenticated, with no auth header sent", async (path) => {
    const res = await fetch(`${baseUrl}${path}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});

describe("legal-site — content correctness", () => {
  it("Concierge Privacy Policy route matches the current legal-concierge content", async () => {
    const res = await fetch(`${baseUrl}/concierge/privacy`);
    const html = await res.text();
    const doc = loadConciergePrivacy();
    expect(html).toContain(doc.effectiveDate);
    expect(html).toContain(doc.version);
    expect(html).toContain("Sentinel Concierge");
  });

  it("Concierge T&C route matches the current legal-concierge content", async () => {
    const res = await fetch(`${baseUrl}/concierge/terms`);
    const html = await res.text();
    const doc = loadConciergeTerms();
    expect(html).toContain(doc.effectiveDate);
  });

  it("Cook Privacy Policy route matches the current legal-cook content", async () => {
    const res = await fetch(`${baseUrl}/cook/privacy`);
    const html = await res.text();
    const doc = loadCookPrivacy();
    expect(html).toContain(doc.effectiveDate);
    expect(html).toContain("Sentinel Cook");
  });

  it("Cook T&C route matches the current legal-cook content", async () => {
    const res = await fetch(`${baseUrl}/cook/terms`);
    const html = await res.text();
    const doc = loadCookTerms();
    expect(html).toContain(doc.effectiveDate);
  });

  it("effective date/version render correctly on every legal page", async () => {
    for (const path of ["/concierge/privacy", "/concierge/terms", "/cook/privacy", "/cook/terms"]) {
      const res = await fetch(`${baseUrl}${path}`);
      const html = await res.text();
      expect(html).toMatch(/Effective date/i);
      expect(html).toMatch(/Version/i);
    }
  });
});

describe("legal-site — no cross-contamination", () => {
  it("Concierge routes never render Cook-specific content", async () => {
    const privacy = await (await fetch(`${baseUrl}/concierge/privacy`)).text();
    const terms = await (await fetch(`${baseUrl}/concierge/terms`)).text();
    for (const html of [privacy, terms]) {
      expect(html).not.toContain("Sentinel Cook");
      expect(html).not.toMatch(/dish photo/i);
    }
  });

  it("Cook routes never render Concierge-specific content", async () => {
    const privacy = await (await fetch(`${baseUrl}/cook/privacy`)).text();
    const terms = await (await fetch(`${baseUrl}/cook/terms`)).text();
    for (const html of [privacy, terms]) {
      expect(html).not.toContain("Sentinel Concierge");
      expect(html).not.toMatch(/booking/i);
    }
  });
});
