// Resend integration — Replit "resend" connector.
// Always fetch credentials per call (tokens may rotate); never cache the client.
// Returns null when the connector isn't configured so callers can fail-soft.

import { Resend } from "resend";

interface ResendCredentials {
  apiKey: string;
  fromEmail: string;
}

async function getCredentials(): Promise<ResendCredentials | null> {
  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;
  if (!hostname || !xReplitToken) return null;
  try {
    const data = (await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
      { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } },
    ).then((r) => r.json())) as { items?: Array<{ settings?: { api_key?: string; from_email?: string } }> };
    const settings = data.items?.[0]?.settings;
    if (!settings?.api_key) return null;
    return {
      apiKey: settings.api_key,
      fromEmail: settings.from_email ?? "noreply@konti.app",
    };
  } catch {
    return null;
  }
}

export interface MailerClient {
  client: Resend;
  fromEmail: string;
}

export async function getUncachableResendClient(): Promise<MailerClient | null> {
  const creds = await getCredentials();
  if (!creds) return null;
  return { client: new Resend(creds.apiKey), fromEmail: creds.fromEmail };
}
