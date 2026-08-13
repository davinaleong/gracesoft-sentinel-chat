import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../content");

export interface LegalDocument {
  markdown: string;
  effectiveDate: string;
  version: string;
}

/**
 * The markdown file itself is the single source of truth for effective
 * date/version — parsed out rather than duplicated as separate constants,
 * so there's no way for the rendered page and the document's own header to
 * drift out of sync.
 */
function parseDocument(markdown: string): LegalDocument {
  const effectiveDateMatch = markdown.match(/\*\*Effective date:\*\*\s*(.+)/);
  const versionMatch = markdown.match(/\*\*Version:\*\*\s*(.+)/);
  if (!effectiveDateMatch || !versionMatch) {
    throw new Error("Legal document is missing a required **Effective date:** or **Version:** field");
  }
  return { markdown, effectiveDate: effectiveDateMatch[1]!.trim(), version: versionMatch[1]!.trim() };
}

export function loadPrivacyPolicy(): LegalDocument {
  return parseDocument(readFileSync(resolve(CONTENT_DIR, "privacy-policy.md"), "utf-8"));
}

export function loadTerms(): LegalDocument {
  return parseDocument(readFileSync(resolve(CONTENT_DIR, "terms.md"), "utf-8"));
}
