import { useMemo, useState } from "react";
import { ShieldCheck, Search, RefreshCw, Filter } from "lucide-react";
import {
  useGetAuditLog,
  getGetAuditLogQueryKey,
  type GetAuditLogParams,
  type AuditEntry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { RequireRole } from "@/hooks/auth-provider";
import { useLang } from "@/hooks/use-lang";

const ENTITY_LABELS: Record<string, { en: string; es: string }> = {
  project: { en: "Project", es: "Proyecto" },
  document: { en: "Document", es: "Documento" },
  contractor: { en: "Contractor", es: "Contratista" },
  permit: { en: "Permit", es: "Permiso" },
  calculator: { en: "Calculator", es: "Calculadora" },
  cost_plus: { en: "Cost-plus", es: "Costo más" },
  design: { en: "Design", es: "Diseño" },
  proposal: { en: "Proposal", es: "Propuesta" },
  change_order: { en: "Change order", es: "Orden de cambio" },
  inspection: { en: "Inspection", es: "Inspección" },
  milestone: { en: "Milestone", es: "Hito" },
  lead: { en: "Lead", es: "Lead" },
  punchlist: { en: "Punch list", es: "Punch list" },
  client: { en: "Client", es: "Cliente" },
  system: { en: "System", es: "Sistema" },
};

const ENTITY_BADGE_CLASS: Record<string, string> = {
  project: "bg-konti-olive/15 text-konti-olive",
  document: "bg-blue-100 text-blue-800",
  contractor: "bg-amber-100 text-amber-800",
  permit: "bg-emerald-100 text-emerald-800",
  calculator: "bg-purple-100 text-purple-800",
  cost_plus: "bg-purple-100 text-purple-800",
  design: "bg-indigo-100 text-indigo-800",
  proposal: "bg-pink-100 text-pink-800",
  change_order: "bg-orange-100 text-orange-800",
  inspection: "bg-teal-100 text-teal-800",
  milestone: "bg-cyan-100 text-cyan-800",
  lead: "bg-yellow-100 text-yellow-800",
  punchlist: "bg-rose-100 text-rose-800",
  client: "bg-sky-100 text-sky-800",
  system: "bg-slate-200 text-slate-700",
};

function fmtTimestamp(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(lang === "es" ? "es-PR" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function entityLabel(entity: string, lang: string): string {
  const m = ENTITY_LABELS[entity];
  if (!m) return entity;
  return lang === "es" ? m.es : m.en;
}

function AuditPageInner() {
  const { t, lang } = useLang();
  const qc = useQueryClient();

  const [projectId, setProjectId] = useState<string>("");
  const [actor, setActor] = useState<string>("");
  const [actorInput, setActorInput] = useState<string>("");
  const [entity, setEntity] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const params: GetAuditLogParams = useMemo(() => {
    const p: GetAuditLogParams = { limit: 500 };
    if (projectId) p.projectId = projectId;
    if (actor) p.actor = actor;
    if (entity) p.entity = entity;
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [projectId, actor, entity, from, to]);

  const { data, isLoading, isError, refetch, isFetching } = useGetAuditLog(params, {
    query: { queryKey: getGetAuditLogQueryKey(params) },
  });

  const entries: AuditEntry[] = data?.entries ?? [];
  const projectsList = data?.filters?.projects ?? [];
  const entitiesList = data?.filters?.entities ?? [];

  const onApply = () => {
    setActor(actorInput.trim());
  };

  const onReset = () => {
    setProjectId("");
    setActor("");
    setActorInput("");
    setEntity("");
    setFrom("");
    setTo("");
  };

  const onRefresh = () => {
    void qc.invalidateQueries({ queryKey: ["/api/audit"] });
    void refetch();
  };

  return (
    <AppLayout>
      <div className="space-y-5" data-testid="audit-page">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-konti-olive shrink-0" />
              {t("Audit Log", "Registro de Auditoría")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t(
                "Every recorded change across projects, documents, contractors, permits, and the calculator.",
                "Cada cambio registrado en proyectos, documentos, contratistas, permisos y la calculadora.",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isFetching}
            data-testid="btn-audit-refresh"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-border bg-card hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            {t("Refresh", "Actualizar")}
          </button>
        </header>

        <section className="bg-card rounded-xl border border-card-border p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-wide text-muted-foreground">
            <Filter className="w-3.5 h-3.5" /> {t("Filters", "Filtros")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">{t("Project", "Proyecto")}</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                data-testid="filter-audit-project"
                className="px-2 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">{t("All projects", "Todos los proyectos")}</option>
                {projectsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">{t("Entity", "Entidad")}</span>
              <select
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                data-testid="filter-audit-entity"
                className="px-2 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">{t("All", "Todas")}</option>
                {entitiesList.map((en) => (
                  <option key={en} value={en}>
                    {entityLabel(en, lang)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">{t("Actor", "Actor")}</span>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={actorInput}
                  onChange={(e) => setActorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onApply();
                  }}
                  placeholder={t("Name contains…", "Nombre contiene…")}
                  data-testid="filter-audit-actor"
                  className="flex-1 min-w-0 px-2 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  type="button"
                  onClick={onApply}
                  data-testid="btn-audit-actor-apply"
                  className="px-2 py-2 rounded-md border border-input bg-card hover:bg-muted"
                  title={t("Apply actor filter", "Aplicar filtro de actor")}
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">{t("From", "Desde")}</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                data-testid="filter-audit-from"
                className="px-2 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">{t("To", "Hasta")}</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                data-testid="filter-audit-to"
                className="px-2 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>
          <div className="flex items-center justify-between mt-3 gap-3">
            <p className="text-xs text-muted-foreground" data-testid="audit-count">
              {data
                ? t(
                    `${data.matching} matching · ${data.returned} shown · ${data.total} total`,
                    `${data.matching} coincidencia(s) · ${data.returned} mostrada(s) · ${data.total} total`,
                  )
                : t("Loading…", "Cargando…")}
            </p>
            <button
              type="button"
              onClick={onReset}
              data-testid="btn-audit-reset"
              className="text-xs text-konti-olive hover:text-konti-olive/80 font-medium"
            >
              {t("Reset filters", "Restablecer filtros")}
            </button>
          </div>
        </section>

        <section className="bg-card rounded-xl border border-card-border shadow-sm overflow-hidden">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground" data-testid="audit-loading">
              {t("Loading audit log…", "Cargando registro…")}
            </p>
          ) : isError ? (
            <p className="p-6 text-sm text-destructive" data-testid="audit-error">
              {t("Could not load audit log.", "No se pudo cargar el registro.")}
            </p>
          ) : entries.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground" data-testid="audit-empty">
              {t("No entries match your filters.", "No hay entradas que coincidan con los filtros.")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]" data-testid="audit-table">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">{t("Time", "Hora")}</th>
                    <th className="text-left px-4 py-2 font-medium">{t("Actor", "Actor")}</th>
                    <th className="text-left px-4 py-2 font-medium">{t("Entity", "Entidad")}</th>
                    <th className="text-left px-4 py-2 font-medium">{t("Project", "Proyecto")}</th>
                    <th className="text-left px-4 py-2 font-medium">{t("Description", "Descripción")}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const desc = lang === "es" ? entry.descriptionEs : entry.description;
                    const badgeClass =
                      ENTITY_BADGE_CLASS[entry.entity] ?? "bg-slate-200 text-slate-700";
                    return (
                      <tr
                        key={entry.id}
                        className="border-t border-border/60 hover:bg-muted/30"
                        data-testid={`audit-row-${entry.id}`}
                      >
                        <td className="px-4 py-2 align-top whitespace-nowrap text-xs text-muted-foreground">
                          {fmtTimestamp(entry.timestamp, lang)}
                        </td>
                        <td className="px-4 py-2 align-top">
                          <div className="text-foreground font-medium">{entry.actor}</div>
                          {entry.actorRole ? (
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {entry.actorRole}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 align-top">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}
                          >
                            {entityLabel(entry.entity, lang)}
                          </span>
                          <div className="text-[10px] text-muted-foreground mt-1 break-words">
                            {entry.type}
                          </div>
                        </td>
                        <td className="px-4 py-2 align-top text-xs text-foreground">
                          {entry.projectName ?? entry.projectId ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 align-top text-sm text-foreground break-words">
                          {desc}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}

export default function AuditPage() {
  return (
    <RequireRole roles={["admin", "superadmin"]}>
      <AuditPageInner />
    </RequireRole>
  );
}
