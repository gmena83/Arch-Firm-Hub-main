// Thin Asana REST client used by the sync queue (Task #127).
//
// We deliberately do *not* use the official asana SDK npm package because the
// Replit "Asana" connector returns an OAuth bearer token via the credential
// proxy, and the REST surface we need is small (workspaces, projects, tasks,
// comments, search). Going direct keeps the dependency footprint small and
// keeps token refresh entirely inside `getAsanaAccessToken()`.
//
// Token refresh is handled the same way the standard Replit connector
// boilerplate handles it: every call goes through `getAsanaAccessToken()`
// which fetches a fresh token from the connectors-v2 proxy. We never cache
// the token at module scope (per the integrations skill).

import { logger } from "./logger";

const CONNECTOR_NAME = "asana";

interface ConnectorEnvelope {
  items?: Array<{
    settings?: {
      access_token?: string;
      oauth?: { credentials?: { access_token?: string } };
    };
  }>;
}

export class AsanaNotConnectedError extends Error {
  constructor(message = "Asana connector is not configured") {
    super(message);
    this.name = "AsanaNotConnectedError";
  }
}

export class AsanaApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Asana API ${status}: ${body.slice(0, 200)}`);
    this.name = "AsanaApiError";
    this.status = status;
    this.body = body;
  }
}

// Returns the current OAuth access token from the Replit connector proxy.
// Throws AsanaNotConnectedError if the connector isn't bound to this Repl.
export async function getAsanaAccessToken(): Promise<string> {
  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  if (!hostname) throw new AsanaNotConnectedError("REPLIT_CONNECTORS_HOSTNAME not set");

  const xReplitToken =
    process.env["REPL_IDENTITY"]
      ? `repl ${process.env["REPL_IDENTITY"]}`
      : process.env["WEB_REPL_RENEWAL"]
        ? `depl ${process.env["WEB_REPL_RENEWAL"]}`
        : null;
  if (!xReplitToken) throw new AsanaNotConnectedError("X_REPLIT_TOKEN not available");

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=${CONNECTOR_NAME}`,
    { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } },
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new AsanaNotConnectedError(`connector proxy ${resp.status}: ${text.slice(0, 120)}`);
  }
  const env = (await resp.json()) as ConnectorEnvelope;
  const item = env.items?.[0];
  const token =
    item?.settings?.access_token ?? item?.settings?.oauth?.credentials?.access_token;
  if (!token) throw new AsanaNotConnectedError("Asana connection has no access_token");
  return token;
}

interface AsanaRef {
  gid: string;
  name?: string;
  resource_type?: string;
}

interface AsanaTask {
  gid: string;
  name: string;
  resource_type: "task";
  permalink_url?: string;
  notes?: string;
  completed?: boolean;
  assignee?: { gid: string; name?: string } | null;
}

async function asanaFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAsanaAccessToken();
  const resp = await fetch(`https://app.asana.com/api/1.0${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await resp.text();
  if (!resp.ok) {
    logger.warn({ path, status: resp.status, body: text.slice(0, 200) }, "asana-client: api error");
    throw new AsanaApiError(resp.status, text);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function listWorkspaces(): Promise<AsanaRef[]> {
  const data = await asanaFetch<{ data: AsanaRef[] }>(
    `/workspaces?opt_fields=gid,name`,
  );
  return data.data ?? [];
}

export async function listProjectsForWorkspace(workspaceGid: string): Promise<AsanaRef[]> {
  const data = await asanaFetch<{ data: AsanaRef[] }>(
    `/projects?workspace=${encodeURIComponent(workspaceGid)}&archived=false&opt_fields=gid,name&limit=100`,
  );
  return data.data ?? [];
}

export async function listTasksForProject(boardGid: string, limit = 100): Promise<AsanaTask[]> {
  const data = await asanaFetch<{ data: AsanaTask[] }>(
    `/projects/${encodeURIComponent(boardGid)}/tasks?opt_fields=gid,name,permalink_url,completed&limit=${limit}`,
  );
  return data.data ?? [];
}

// Find an existing task in a board whose name (case-insensitive, trimmed)
// matches the candidate. Returns the first match or null.
export async function findTaskByName(boardGid: string, name: string): Promise<AsanaTask | null> {
  const target = name.trim().toLowerCase();
  if (!target) return null;
  const tasks = await listTasksForProject(boardGid, 100);
  for (const t of tasks) {
    if ((t.name ?? "").trim().toLowerCase() === target) return t;
  }
  return null;
}

export interface CreateTaskInput {
  name: string;
  notes?: string;
  workspaceGid: string;
  boardGid: string;
  assigneeGid?: string;
}

export async function createTask(input: CreateTaskInput): Promise<AsanaTask> {
  const body: Record<string, unknown> = {
    name: input.name,
    workspace: input.workspaceGid,
    projects: [input.boardGid],
  };
  if (input.notes) body["notes"] = input.notes;
  if (input.assigneeGid) body["assignee"] = input.assigneeGid;
  const data = await asanaFetch<{ data: AsanaTask }>(`/tasks`, {
    method: "POST",
    body: JSON.stringify({ data: body }),
  });
  return data.data;
}

export async function addCommentToTask(taskGid: string, text: string): Promise<{ gid: string }> {
  const data = await asanaFetch<{ data: { gid: string } }>(
    `/tasks/${encodeURIComponent(taskGid)}/stories`,
    {
      method: "POST",
      body: JSON.stringify({ data: { text } }),
    },
  );
  return data.data;
}

// Test seam — used by node:test to swap the fetch implementation.
let _fetchOverride: typeof fetch | null = null;
export function _setFetchForTests(impl: typeof fetch | null): void {
  _fetchOverride = impl;
  if (impl) {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = impl;
  }
}
export function _resetFetchForTests(originalFetch: typeof fetch): void {
  _fetchOverride = null;
  (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
}
