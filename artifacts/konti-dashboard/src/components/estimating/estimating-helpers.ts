// Shared helpers for the estimating UI: API base, auth header, fetch wrappers.

export function apiBase(): string {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

export function getAuthHeader(): Record<string, string> {
  try {
    const stored = localStorage.getItem("konti_auth");
    if (!stored) return {};
    const parsed = JSON.parse(stored) as { token?: string | null };
    return parsed.token ? { Authorization: `Bearer ${parsed.token}` } : {};
  } catch {
    return {};
  }
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  return await sendJson<T>("POST", path, body);
}

export async function putJson<T>(path: string, body: unknown): Promise<T> {
  return await sendJson<T>("PUT", path, body);
}

export async function patchJson<T>(path: string, body: unknown): Promise<T> {
  return await sendJson<T>("PATCH", path, body);
}

// Carries the full server JSON payload so callers can surface structured
// fields (e.g. skippedDetails) when an import fails.
export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;
  constructor(message: string, status: number, payload: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function sendJson<T>(method: "POST" | "PUT" | "PATCH", path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const msg = (typeof err["message"] === "string" ? (err["message"] as string) : undefined) ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, err);
  }
  return (await res.json()) as T;
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { headers: { ...getAuthHeader() } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

export async function readFileAsText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) throw new Error("empty_workbook");
    const sheet = wb.Sheets[firstSheet];
    if (!sheet) throw new Error("empty_sheet");
    return XLSX.utils.sheet_to_csv(sheet);
  }
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("file_read_error"));
    r.readAsText(file);
  });
}

export type {
  VarianceBucket,
  VarianceMaterialCategory,
  VarianceReport,
  VarianceTotals,
} from "@workspace/api-client-react";

export interface ContractorEstimate {
  projectId: string;
  source: string;
  squareMeters: number;
  projectType: string;
  scope: string[];
  bathrooms?: number;
  kitchens?: number;
  lines: Array<{ id: string; category: string; description: string; descriptionEs: string; quantity: number; unit: string; unitPrice: number; lineTotal: number; laborType?: "hourly" | "lump" }>;
  subtotalMaterials: number;
  subtotalLabor: number;
  subtotalSubcontractor: number;
  contingencyPercent: number;
  contingency: number;
  marginPercent?: number;
  marginAmount?: number;
  managementFeePercent?: number;
  managementFeeAmount?: number;
  grandTotal: number;
  generatedAt: string;
  generatedBy: string;
  // P1.4 — Visible manual overrides surfaced on the Contractor tab so the
  // team can input the contractor's actual quoted labor rate instead of
  // relying on the receipt-history average.
  manualLaborRate?: number | null;
  manualMarginPercent?: number | null;
}

export interface LaborRate {
  trade: string;
  tradeEs: string;
  unit: string;
  hourlyRate: number;
  source: "seed" | "import" | "receipts";
  updatedAt: string;
}
