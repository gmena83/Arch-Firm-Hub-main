// P5.2 + P5.4 UI — Multi-item receipt scanner.
//
// Workflow:
//   1. Team picks a receipt image / PDF.
//   2. "Scan" calls /scan-receipt → returns proposed line items + raw OCR.
//   3. Confirmation table lets the team edit category, description, qty,
//      unit price, and the chargeable flag per row before commit.
//   4. "Commit" calls /receipts/commit-line-items → persists rows + parent
//      receipt + refreshes variance aggregation.
//
// The chargeable toggle (P5.4) maps to the team's existing 2a) PURCHASES
// `Class: Included | Excluded` column. Per the 2026-05-11 meeting, this
// is the canonical "non-chargeable" label — a column flag, not a module.

import { useState } from "react";
import { useLang } from "@/hooks/use-lang";
import { useToast } from "@/hooks/use-toast";
import { useListProjects } from "@workspace/api-client-react";
import { ScanLine, Loader2, Trash2, CheckCircle2 } from "lucide-react";

interface ProposedLine {
  description: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  chargeable: boolean;
}

interface ScanResponse {
  projectId: string;
  ocr: { vendor?: string; date?: string; amount?: number; hours?: number; text: string };
  proposedLineItems: ProposedLine[];
}

const CATEGORY_OPTIONS = [
  "container_purchase",
  "structural_prep",
  "cuts_and_frames",
  "interior_build",
  "exterior_windows_and_doors",
  "plumbing",
  "electrical",
  "painting",
  "consumables",
  "bathroom",
  "kitchen",
  "finishes",
  "decking",
  "appliances",
  "labor",
  "subcontractor",
  "foundation",
  "site_electric",
  "site_plumbing",
  "site_work",
  "other",
];

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem("konti_auth") : null;
  let token: string | undefined;
  try { token = raw ? (JSON.parse(raw).token as string) : undefined; } catch { /* ignore */ }
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function fileToBase64DataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function MultiItemReceiptScanner() {
  const { t } = useLang();
  const { toast } = useToast();
  const { data: projects = [] } = useListProjects();
  const [projectId, setProjectId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [lines, setLines] = useState<ProposedLine[]>([]);
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState("");

  const onPick = (f: File | null) => {
    setFile(f);
    setScanResult(null);
    setLines([]);
  };

  const scan = async () => {
    if (!file) {
      toast({ title: t("Pick a receipt first", "Selecciona un recibo primero"), variant: "destructive" });
      return;
    }
    const pid = projectId || projects[0]?.id;
    if (!pid) {
      toast({ title: t("Pick a project first", "Selecciona un proyecto"), variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: t("File too large (max 10 MB)", "Archivo muy grande (máx. 10 MB)"), variant: "destructive" });
      return;
    }
    setScanning(true);
    try {
      const dataUrl = await fileToBase64DataUrl(file);
      const res = await authedFetch(`/api/projects/${pid}/scan-receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: dataUrl, filename: file.name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `Scan failed (${res.status})`);
      }
      const json = (await res.json()) as ScanResponse;
      setScanResult(json);
      setLines(json.proposedLineItems ?? []);
      setVendor(json.ocr.vendor ?? "");
      setDate(json.ocr.date ?? "");
      toast({
        title: t(
          `Scanned · ${json.proposedLineItems?.length ?? 0} line(s) proposed`,
          `Escaneado · ${json.proposedLineItems?.length ?? 0} línea(s) propuesta(s)`,
        ),
      });
    } catch (err) {
      toast({
        title: t("Scan failed", "Falló el escaneo"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  const updateLine = (idx: number, patch: Partial<ProposedLine>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };
        next.lineTotal = Math.round(next.quantity * next.unitPrice * 100) / 100;
        return next;
      }),
    );
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const commit = async () => {
    const pid = scanResult?.projectId ?? projectId ?? projects[0]?.id;
    if (!pid) return;
    if (lines.length === 0) {
      toast({ title: t("No lines to commit", "Sin líneas para guardar"), variant: "destructive" });
      return;
    }
    setCommitting(true);
    try {
      const res = await authedFetch(`/api/projects/${pid}/receipts/commit-line-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor: vendor.trim(),
          date: date.trim(),
          items: lines.map((l) => ({
            description: l.description,
            category: l.category,
            quantity: l.quantity,
            unit: l.unit,
            unitPrice: l.unitPrice,
            chargeable: l.chargeable,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "commit_failed");
      }
      const data = await res.json();
      toast({
        title: t("Receipt committed", "Recibo guardado"),
        description: t(
          `${lines.length} line(s) added · $${data?.receipt?.amount?.toLocaleString?.() ?? lines.reduce((a, l) => a + l.lineTotal, 0).toLocaleString()} total`,
          `${lines.length} línea(s) · $${data?.receipt?.amount?.toLocaleString?.() ?? lines.reduce((a, l) => a + l.lineTotal, 0).toLocaleString()} total`,
        ),
      });
      // Reset for next scan.
      setFile(null);
      setScanResult(null);
      setLines([]);
      setVendor("");
      setDate("");
    } catch (err) {
      toast({
        title: t("Commit failed", "Falló al guardar"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setCommitting(false);
    }
  };

  const total = lines.reduce((a, l) => a + l.lineTotal, 0);
  const chargeableTotal = lines.filter((l) => l.chargeable).reduce((a, l) => a + l.lineTotal, 0);

  return (
    <section className="bg-card rounded-xl border border-card-border shadow-sm p-5" data-testid="multi-item-receipt-scanner">
      <header className="flex items-center gap-2 mb-3">
        <ScanLine className="w-5 h-5 text-konti-olive" />
        <h2 className="font-bold text-foreground">
          {t("Multi-item Receipt Scanner", "Escáner de Recibos Multi-línea")}
        </h2>
      </header>
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        {t(
          "Upload a receipt (PDF or image). The OCR + AI extractor proposes one row per material; review and toggle the Chargeable flag before committing. Non-chargeable lines are absorbed by KONTi and won't appear on the client invoice.",
          "Sube un recibo (PDF o imagen). El OCR + IA propone una fila por material; revisa y activa el indicador 'Facturable' antes de guardar. Las líneas no facturables las absorbe KONTi.",
        )}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          data-testid="scanner-project"
          className="px-3 py-2 rounded-md border border-input bg-background text-sm"
        >
          <option value="">{t("Pick project", "Elegir proyecto")}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          data-testid="scanner-file"
          className="px-3 py-2 rounded-md border border-input bg-background text-sm"
        />
        <button
          type="button"
          onClick={scan}
          disabled={scanning || !file}
          data-testid="btn-scan-receipt"
          className="px-4 py-2 rounded-md bg-konti-olive text-white text-sm font-semibold hover:bg-konti-olive/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
          {scanning ? t("Scanning…", "Escaneando…") : t("Scan receipt", "Escanear recibo")}
        </button>
      </div>

      {scanResult && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="text-xs">
              <span className="font-medium block mb-1">{t("Vendor", "Proveedor")}</span>
              <input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                data-testid="scanner-vendor"
                className="w-full px-3 py-2 rounded-md border border-input bg-background"
                maxLength={120}
              />
            </label>
            <label className="text-xs">
              <span className="font-medium block mb-1">{t("Date", "Fecha")}</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="scanner-date"
                className="w-full px-3 py-2 rounded-md border border-input bg-background"
              />
            </label>
          </div>

          {lines.length === 0 ? (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3" data-testid="scanner-empty">
              {t(
                "No line items extracted. The AI couldn't parse this receipt — add lines manually below or try a clearer image.",
                "No se extrajeron líneas. La IA no pudo parsear este recibo — agrega líneas manualmente o intenta una imagen más clara.",
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border" data-testid="scanner-line-table">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-2 py-2 font-semibold text-muted-foreground">{t("Description", "Descripción")}</th>
                    <th className="text-left px-2 py-2 font-semibold text-muted-foreground">{t("Category", "Categoría")}</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">{t("Qty", "Cant.")}</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">{t("Unit price", "P. unitario")}</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground">{t("Total", "Total")}</th>
                    <th className="text-center px-2 py-2 font-semibold text-muted-foreground">{t("Chargeable", "Facturable")}</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l, idx) => (
                    <tr key={idx} data-testid={`scanner-row-${idx}`}>
                      <td className="px-2 py-1">
                        <input
                          value={l.description}
                          onChange={(e) => updateLine(idx, { description: e.target.value })}
                          className="w-full px-2 py-1 rounded border border-input bg-background"
                          maxLength={300}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <select
                          value={l.category}
                          onChange={(e) => updateLine(idx, { category: e.target.value })}
                          className="w-full px-2 py-1 rounded border border-input bg-background"
                          data-testid={`scanner-category-${idx}`}
                        >
                          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.quantity}
                          onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 0 })}
                          className="w-16 px-2 py-1 rounded border border-input bg-background text-right"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.unitPrice}
                          onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value) || 0 })}
                          className="w-20 px-2 py-1 rounded border border-input bg-background text-right"
                        />
                      </td>
                      <td className="px-2 py-1 text-right font-semibold">
                        ${l.lineTotal.toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={l.chargeable}
                          onChange={(e) => updateLine(idx, { chargeable: e.target.checked })}
                          data-testid={`scanner-chargeable-${idx}`}
                          aria-label={t("Chargeable to client", "Facturable al cliente")}
                          className="accent-konti-olive w-4 h-4"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          aria-label={t("Remove line", "Eliminar línea")}
                          data-testid={`btn-remove-line-${idx}`}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t border-border">
                  <tr>
                    <td colSpan={4} className="px-2 py-2 text-right text-muted-foreground">
                      {t("Total", "Total")}
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-foreground">
                      ${total.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-center text-[10px] text-konti-olive font-semibold">
                      ${chargeableTotal.toLocaleString()}
                      <br />
                      <span className="font-normal text-muted-foreground">{t("billable", "facturable")}</span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={commit}
            disabled={committing || lines.length === 0}
            data-testid="btn-commit-lines"
            className="w-full md:w-auto px-4 py-2 rounded-md bg-konti-olive text-white text-sm font-semibold hover:bg-konti-olive/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {committing ? t("Saving…", "Guardando…") : t(`Commit ${lines.length} line(s)`, `Guardar ${lines.length} línea(s)`)}
          </button>
        </div>
      )}
    </section>
  );
}
