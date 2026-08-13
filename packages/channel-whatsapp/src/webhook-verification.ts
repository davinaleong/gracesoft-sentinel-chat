/**
 * The GET `/webhook` handshake Meta performs once when a webhook URL is
 * registered — pure logic, kept separate from the Express route so it's
 * trivially unit-testable without spinning up a server.
 */
export function handleVerificationRequest(
  query: Record<string, string | undefined>,
  verifyToken: string
): { status: number; body?: string } {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return { status: 200, body: challenge };
  }
  return { status: 403 };
}
