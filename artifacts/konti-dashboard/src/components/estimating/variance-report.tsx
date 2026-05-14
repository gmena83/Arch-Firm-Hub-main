import { useEffect, useState } from "react";
import { useLang } from "@/hooks/use-lang";
import { useAuth } from "@/hooks/use-auth";
import { useListProjects } from "@workspace/api-client-react";
import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { getJson, type VarianceReport } from "./estimating-helpers";

export function VarianceReportPanel({
  defaultProjectId,
  showProjectPicker = true,
  compact = false,
}: {
  defaultProjectId?: string;
  showProjectPicker?: boolean;
  compact?: boolean;
}) {
  const { t, lang } = useLang();
  const { data: projects = [] } = useListProjects();
  const { viewRole } = useAuth();
  const isClientView = viewRole === "client";
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? "");
  const [report, setReport] = useState<VarianceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);
  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projects, projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancel = false;
    setLoading(true);
    setError(null);
    getJson<VarianceReport>(`/api/projects/${projectId}/variance-report`)
      .then((d) => { if (!cancel) setReport(d); })
      .catch((e) => { if (!cancel) setError(e instanceof Error ? e.message : "error"); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [projectId]);

  const fmtPct = (p: number | null): string => (p === null ? "—" : `${p >= 0 ? "+" : ""}${p}%`);
  const renderDelta = (value: number, percent: number | null, testid?: string) => (
    <span
      data-testid={testid}
      className={`font-bold ${value > 0 ? "text-destructive" : value < 0 ? "text-konti-olive" : "text-muted-foreground"} flex items-center gap-1`}
    >
      {value > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : value < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
      {value >= 0 ? "+" : ""}${value.toLocaleString()} ({fmtPct(percent)})
    </span>
  );

  return (
    <div className="space-y-4" data-testid="variance-report-panel">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-konti-olive" />
          <h2 className="font-bold text-foreground">{t("Estimated vs Invoiced vs Actual", "Estimado vs Facturado vs Real")}</h2>
        </div>
        {showProjectPicker && (
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            data-testid="variance-project"
            className="px-3 py-2 rounded-md border border-input bg-card text-sm"
          >
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">{t("Loading variance report...", "Cargando reporte de varianza...")}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {report && (
        <>
          <p className="text-xs text-muted-foreground">
            {t("Source:", "Fuente:")} {report.estimateSource === "contractor_estimate" ? t("Contractor estimate", "Estimado de contratista") : t("Calculator entries", "Entradas de calculadora")}
            {" · "}
            <span title={t(
              "Variance pills compare Actual minus the column to their left (Invoiced for the per-bucket pill, Estimated for the secondary delta).",
              "Las píldoras de varianza comparan Real menos la columna a la izquierda (Facturado para la principal, Estimado para la secundaria).",
            )} className="cursor-help underline decoration-dotted">
              {t("How variance is computed", "Cómo se calcula la varianza")}
            </span>
          </p>

          <div className={`grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3"}`}>
            {report.buckets
              .filter((b) => !(isClientView && b.key === "unassigned"))
              .map((b) => (
              <div key={b.key} className="bg-card rounded-xl border border-card-border p-4 shadow-sm" data-testid={`variance-bucket-${b.key}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">{lang === "es" ? b.labelEs : b.labelEn}</p>
                  <StatusPill status={b.status} />
                </div>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">{t("Estimated", "Estimado")}</span>
                  <span className="font-semibold text-foreground">${b.estimated.toLocaleString()}</span>
                </div>
                {!isClientView && (
                  <div className="flex items-baseline justify-between text-xs mt-1">
                    <span className="text-muted-foreground">{t("Invoiced", "Facturado")}</span>
                    <span className="font-semibold text-foreground" data-testid={`variance-bucket-${b.key}-invoiced`}>${b.invoiced.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between text-xs mt-1">
                  <span className="text-muted-foreground">{t("Actual", "Real")}</span>
                  <span className="font-semibold text-foreground">${b.actual.toLocaleString()}</span>
                </div>
                {!isClientView && (
                  <div className="flex items-baseline justify-between text-sm border-t border-border pt-1.5 mt-1.5">
                    <span className="text-muted-foreground" title={t("Actual minus Invoiced", "Real menos Facturado")}>{t("Δ vs Invoiced", "Δ vs Facturado")}</span>
                    {renderDelta(b.varianceVsInvoiced, b.varianceVsInvoicedPercent, `variance-bucket-${b.key}-delta-invoiced`)}
                  </div>
                )}
                <div className={`flex items-baseline justify-between text-xs mt-1 ${isClientView ? "border-t border-border pt-1.5" : ""}`}>
                  <span className="text-muted-foreground" title={t("Actual minus Estimated", "Real menos Estimado")}>{t("Δ vs Estimated", "Δ vs Estimado")}</span>
                  <span className={`font-medium ${b.variance > 0 ? "text-destructive/80" : b.variance < 0 ? "text-konti-olive/80" : "text-muted-foreground"}`}>
                    {b.variance >= 0 ? "+" : ""}${b.variance.toLocaleString()} ({fmtPct(b.variancePercent)})
                  </span>
                </div>
              </div>
            ))}
          </div>

          {!compact && (
            <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">{t("Top-line comparison", "Comparación general")}</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.buckets
                    .filter((b) => !(isClientView && b.key === "unassigned"))
                    .map((b) => ({
                      name: lang === "es" ? b.labelEs : b.labelEn,
                      [t("Estimated", "Estimado")]: b.estimated,
                      ...(isClientView ? {} : { [t("Invoiced", "Facturado")]: b.invoiced }),
                      [t("Actual", "Real")]: b.actual,
                    }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                    <Legend />
                    <Bar dataKey={t("Estimated", "Estimado")} fill="var(--konti-slate, #778894)" />
                    {!isClientView && (
                      <Bar dataKey={t("Invoiced", "Facturado")} fill="var(--konti-dark, #2A2D2F)" />
                    )}
                    <Bar dataKey={t("Actual", "Real")} fill="var(--konti-olive, #4F5E2A)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {!compact && report.materialCategories.length > 0 && (
            <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">{t("Materials by category", "Materiales por categoría")}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2">{t("Category", "Categoría")}</th>
                      <th className="text-right px-3 py-2">{t("Estimated", "Estimado")}</th>
                      {!isClientView && (
                        <th className="text-right px-3 py-2">{t("Invoiced", "Facturado")}</th>
                      )}
                      <th className="text-right px-3 py-2">{t("Actual", "Real")}</th>
                      {!isClientView && (
                        <th className="text-right px-3 py-2">{t("Δ vs Invoiced", "Δ vs Facturado")}</th>
                      )}
                      <th className="text-right px-3 py-2">{t("Δ vs Estimated", "Δ vs Estimado")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.materialCategories.map((c) => (
                      <tr key={c.category}>
                        <td className="px-3 py-1.5 capitalize">{c.category}</td>
                        <td className="px-3 py-1.5 text-right">${c.estimated.toLocaleString()}</td>
                        {!isClientView && (
                          <td className="px-3 py-1.5 text-right" data-testid={`variance-cat-${c.category}-invoiced`}>${c.invoiced.toLocaleString()}</td>
                        )}
                        <td className="px-3 py-1.5 text-right">${c.actual.toLocaleString()}</td>
                        {!isClientView && (
                          <td className={`px-3 py-1.5 text-right font-semibold ${c.varianceVsInvoiced > 0 ? "text-destructive" : c.varianceVsInvoiced < 0 ? "text-konti-olive" : "text-muted-foreground"}`}>
                            {c.varianceVsInvoiced >= 0 ? "+" : ""}${c.varianceVsInvoiced.toLocaleString()} ({fmtPct(c.varianceVsInvoicedPercent)})
                          </td>
                        )}
                        <td className={`px-3 py-1.5 text-right ${c.variance > 0 ? "text-destructive/80" : c.variance < 0 ? "text-konti-olive/80" : "text-muted-foreground"}`}>
                          {c.variance >= 0 ? "+" : ""}${c.variance.toLocaleString()} ({fmtPct(c.variancePercent)})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className={`bg-konti-dark rounded-xl p-5 grid grid-cols-2 gap-3 text-white ${isClientView ? "md:grid-cols-3" : "md:grid-cols-5"}`} data-testid="variance-totals">
            <div>
              <p className="text-xs text-white/50">{t("Total Estimated", "Total Estimado")}</p>
              <p className="text-xl font-bold">${report.totals.estimated.toLocaleString()}</p>
            </div>
            {!isClientView && (
              <div>
                <p className="text-xs text-white/50" title={t(
                  "All invoices billed to the client for this project (in-plan + unassigned).",
                  "Todas las facturas emitidas al cliente del proyecto (en plan + fuera de plan).",
                )}>
                  {t("Total Invoiced", "Total Facturado")}
                </p>
                <p className="text-xl font-bold" data-testid="variance-totals-invoiced">
                  ${(report.totals.invoicedInPlan + report.totals.invoicedUnassigned).toLocaleString()}
                </p>
                <p className="text-[10px] text-white/40 mt-0.5" data-testid="variance-totals-invoiced-breakdown">
                  ${report.totals.invoicedInPlan.toLocaleString()} {t("in plan", "en plan")}
                  {report.totals.invoicedUnassigned > 0 && (
                    <> · ${report.totals.invoicedUnassigned.toLocaleString()} {t("unassigned", "fuera de plan")}</>
                  )}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-white/50">{t("Total Actual", "Total Real")}</p>
              <p className="text-xl font-bold">${report.totals.actual.toLocaleString()}</p>
            </div>
            {!isClientView && (
              <div>
                <p className="text-xs text-white/50" title={t(
                  "Actual minus In-plan Invoiced (matched scope: M/L/S only).",
                  "Real menos Facturado en plan (alcance equivalente: sólo M/L/S).",
                )}>{t("Δ vs Invoiced", "Δ vs Facturado")}</p>
                <p className={`text-xl font-bold ${report.totals.varianceVsInvoiced > 0 ? "text-red-300" : report.totals.varianceVsInvoiced < 0 ? "text-emerald-300" : "text-white/70"}`} data-testid="variance-totals-delta-invoiced">
                  {report.totals.varianceVsInvoiced >= 0 ? "+" : ""}${report.totals.varianceVsInvoiced.toLocaleString()} ({fmtPct(report.totals.varianceVsInvoicedPercent)})
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-white/50" title={t("Actual minus Estimated", "Real menos Estimado")}>{t("Δ vs Estimated", "Δ vs Estimado")}</p>
              <p className={`text-xl font-bold ${report.totals.variance > 0 ? "text-red-300" : report.totals.variance < 0 ? "text-emerald-300" : "text-white/70"}`}>
                {report.totals.variance >= 0 ? "+" : ""}${report.totals.variance.toLocaleString()} ({fmtPct(report.totals.variancePercent)})
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: "on_track" | "warning" | "over" }) {
  const { t } = useLang();
  const map = {
    on_track: { label: t("On track", "En línea"), cls: "bg-emerald-100 text-emerald-700" },
    warning: { label: t("Watch", "Atención"), cls: "bg-amber-100 text-amber-700" },
    over: { label: t("Over", "Sobre"), cls: "bg-red-100 text-red-700" },
  } as const;
  const m = map[status];
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>;
}

export default VarianceReportPanel;
