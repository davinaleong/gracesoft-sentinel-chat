import { marked } from "marked";
import type { LegalDocument } from "@gracesoft-sentinel/legal-concierge";

/**
 * Wraps a legal document's markdown into a minimal, dependency-free HTML
 * page — no client-side JS, nothing that could stop Meta/Telegram's
 * crawlers or a human on a slow connection from reading it.
 */
export function renderLegalPage(title: string, doc: LegalDocument): string {
  const body = marked.parse(doc.markdown, { async: false });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="/favicon.png" type="image/png">
<style>
  body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }
  h1, h2 { line-height: 1.3; }
  a { color: #1a56db; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
