import { Router, Request, Response } from "express";

const router = Router();

const HTML_SHELL = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — GraceSoft Sentinel</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1a1a1a;
      background: #f9f9f9;
      padding: 2rem 1rem;
    }
    .container { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 2.5rem 3rem; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    h1 { font-size: 1.75rem; margin-bottom: .25rem; }
    .meta { color: #666; font-size: .875rem; margin-bottom: 2rem; }
    h2 { font-size: 1.1rem; margin-top: 1.75rem; margin-bottom: .5rem; }
    p, li { line-height: 1.7; color: #333; font-size: .95rem; }
    ul { padding-left: 1.25rem; margin-top: .5rem; }
    li { margin-bottom: .3rem; }
    a { color: #0070f3; }
    footer { margin-top: 2.5rem; font-size: .8rem; color: #999; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    ${body}
    <footer>&copy; ${new Date().getFullYear()} GraceSoft &mdash; <a href="/privacy">Privacy Policy</a> &middot; <a href="/terms">Terms &amp; Conditions</a></footer>
  </div>
</body>
</html>`;

// ── GET /privacy ──────────────────────────────────────────────────────────────
router.get("/privacy", (_req: Request, res: Response) => {
  const body = `
    <h1>Privacy Policy</h1>
    <p class="meta">Effective date: 9 July 2026</p>

    <h2>1. Who we are</h2>
    <p>GraceSoft Sentinel ("we", "our", "us") is a WhatsApp and Telegram AI assistant service
    operated by GraceSoft (<a href="https://gracesoft.dev">gracesoft.dev</a>).
    This policy explains what data we collect when you interact with our bot and how we use it.</p>

    <h2>2. Data we collect</h2>
    <ul>
      <li><strong>Messaging data:</strong> the text messages and images you send to the bot in order to fulfil your request (e.g. booking queries, dish photos).</li>
      <li><strong>Phone / Telegram ID:</strong> your channel-assigned identifier, used solely to route replies back to you.</li>
      <li><strong>Booking details:</strong> name, preferred date/time, and any notes you provide during a Concierge booking flow.</li>
    </ul>

    <h2>3. How we use your data</h2>
    <ul>
      <li>To process your requests and send you a reply within the same conversation.</li>
      <li>To check calendar availability and create appointments via Google Calendar (Concierge).</li>
      <li>To analyse dish images and return recipe information via OpenAI (Cook).</li>
    </ul>

    <h2>4. Data retention</h2>
    <p>Conversation session state is held in memory only and is discarded when the session expires (30 minutes of inactivity). We do not persist your messages to a database. Booking events are stored in the operator's Google Calendar and are subject to that calendar's retention settings.</p>

    <h2>5. Third-party processors</h2>
    <ul>
      <li><strong>Meta Platforms</strong> — WhatsApp Cloud API message delivery.</li>
      <li><strong>Telegram</strong> — Telegram Bot API message delivery.</li>
      <li><strong>Google LLC</strong> — Calendar API for appointment scheduling.</li>
      <li><strong>OpenAI</strong> — Vision API for dish recognition (Cook only).</li>
      <li><strong>Anthropic</strong> — Claude API for conversational responses (where configured).</li>
    </ul>
    <p>Each processor handles data under its own privacy policy. We share only the minimum information required to fulfil your request.</p>

    <h2>6. Your rights</h2>
    <p>You may request deletion of any booking we hold for you at any time by contacting us at
    <a href="mailto:privacy@gracesoft.dev">privacy@gracesoft.dev</a>.</p>

    <h2>7. Changes to this policy</h2>
    <p>We may update this policy from time to time. The effective date above will be updated accordingly. Continued use of the service after changes constitutes acceptance.</p>

    <h2>8. Contact</h2>
    <p><a href="mailto:privacy@gracesoft.dev">privacy@gracesoft.dev</a></p>`;

  res.status(200).send(HTML_SHELL("Privacy Policy", body));
});

// ── GET /terms ────────────────────────────────────────────────────────────────
router.get("/terms", (_req: Request, res: Response) => {
  const body = `
    <h1>Terms &amp; Conditions</h1>
    <p class="meta">Effective date: 9 July 2026</p>

    <h2>1. Acceptance</h2>
    <p>By sending a message to GraceSoft Sentinel you agree to these Terms &amp; Conditions. If you do not agree, please do not use the service.</p>

    <h2>2. The service</h2>
    <p>GraceSoft Sentinel provides two AI-assisted features via WhatsApp and Telegram:</p>
    <ul>
      <li><strong>Concierge</strong> — conversational booking assistant powered by Google Calendar.</li>
      <li><strong>Cook</strong> — dish recognition and recipe suggestion powered by OpenAI gpt-4o vision.</li>
    </ul>

    <h2>3. Acceptable use</h2>
    <p>You must not use the service to:</p>
    <ul>
      <li>Send spam, abusive, or unlawful content.</li>
      <li>Attempt to reverse-engineer, scrape, or disrupt the service.</li>
      <li>Impersonate another person or entity.</li>
    </ul>
    <p>We reserve the right to block access for violations without notice.</p>

    <h2>4. Accuracy of information</h2>
    <p>AI-generated responses (recipes, nutritional estimates, booking summaries) are provided for convenience only and may contain errors. You should verify any information before acting on it. We make no warranty as to the accuracy, completeness, or fitness for purpose of any AI-generated content.</p>

    <h2>5. Bookings</h2>
    <p>A booking request submitted through Concierge is confirmed only when you receive an explicit confirmation message from the bot. Calendar availability shown during the conversation is indicative and subject to change.</p>

    <h2>6. Limitation of liability</h2>
    <p>To the maximum extent permitted by law, GraceSoft shall not be liable for any indirect, incidental, or consequential loss arising from your use of the service, including reliance on AI-generated content.</p>

    <h2>7. Intellectual property</h2>
    <p>All software, branding, and content comprising GraceSoft Sentinel is owned by or licensed to GraceSoft. You may not reproduce or distribute it without prior written permission.</p>

    <h2>8. Governing law</h2>
    <p>These terms are governed by the laws of Singapore. Any disputes shall be subject to the exclusive jurisdiction of the courts of Singapore.</p>

    <h2>9. Changes to these terms</h2>
    <p>We may revise these terms at any time. The effective date above will be updated. Continued use of the service constitutes acceptance of the revised terms.</p>

    <h2>10. Contact</h2>
    <p><a href="mailto:legal@gracesoft.dev">legal@gracesoft.dev</a></p>`;

  res.status(200).send(HTML_SHELL("Terms & Conditions", body));
});

export default router;
