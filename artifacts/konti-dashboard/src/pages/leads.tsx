import { useState, useMemo } from "react";
import { useListLeads, useAcceptLead, getListLeadsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { RequireRole } from "@/hooks/auth-provider";
import { useLang } from "@/hooks/use-lang";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Globe, Instagram, Newspaper, Calendar, UserPlus,
  CheckCircle2, X, Phone, Mail, MapPin, DollarSign, Mountain,
  Sparkles, ExternalLink, Filter,
} from "lucide-react";

const SOURCE_META: Record<string, { label: string; labelEs: string; icon: typeof Globe; color: string }> = {
  website:  { label: "Website",  labelEs: "Sitio web",   icon: Globe,     color: "text-sky-700 bg-sky-100" },
  social:   { label: "Social",   labelEs: "Redes",       icon: Instagram, color: "text-pink-700 bg-pink-100" },
  referral: { label: "Referral", labelEs: "Referencia",  icon: UserPlus,  color: "text-emerald-700 bg-emerald-100" },
  media:    { label: "Media",    labelEs: "Medios",      icon: Newspaper, color: "text-amber-700 bg-amber-100" },
  events:   { label: "Events",   labelEs: "Eventos",     icon: Calendar,  color: "text-violet-700 bg-violet-100" },
};

const TYPE_LABEL: Record<string, { en: string; es: string }> = {
  residencial: { en: "Residential", es: "Residencial" },
  comercial:   { en: "Commercial",  es: "Comercial" },
  mixto:       { en: "Mixed-use",   es: "Mixto" },
  contenedor:  { en: "Container",   es: "Contenedor" },
};

const BUDGET_LABEL: Record<string, string> = {
  under_150k: "< $150K",
  "150k_300k": "$150–300K",
  "300k_500k": "$300–500K",
  "500k_1m": "$500K–1M",
  over_1m: "> $1M",
};

const TERRAIN_LABEL: Record<string, { en: string; es: string }> = {
  no_terrain:    { en: "No land",      es: "Sin terreno" },
  with_terrain:  { en: "Has land",     es: "Con terreno" },
  with_plans:    { en: "Land + plans", es: "Con planos" },
};

const STATUS_COLOR: Record<string, string> = {
  new:       "bg-blue-100 text-blue-800",
  contacted: "bg-amber-100 text-amber-800",
  accepted:  "bg-emerald-100 text-emerald-800",
  rejected:  "bg-rose-100 text-rose-800",
};

function scoreColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-konti-olive";
  if (score >= 40) return "bg-amber-500";
  return "bg-slate-400";
}

const SCORE_LEGEND: Array<{ range: string; color: string; label: string; labelEs: string; hint: string; hintEs: string }> = [
  { range: "80–100", color: "bg-emerald-500", label: "Hot",   labelEs: "Caliente", hint: "Prioritize — high budget, ready land",       hintEs: "Prioridad — presupuesto alto, terreno listo" },
  { range: "60–79",  color: "bg-konti-olive", label: "Warm",  labelEs: "Tibio",    hint: "Strong fit — follow up within 48 h",         hintEs: "Buen ajuste — contactar en 48 h" },
  { range: "40–59",  color: "bg-amber-500",   label: "Cool",  labelEs: "Templado", hint: "Nurture — qualify budget and timeline",       hintEs: "Madurar — calificar presupuesto y tiempo" },
  { range: "0–39",   color: "bg-slate-400",   label: "Cold",  labelEs: "Frío",     hint: "Low fit — auto-reply with KONTi resources",   hintEs: "Bajo ajuste — respuesta automática con recursos" },
];

export default function LeadsPage() {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: leads = [], isLoading } = useListLeads();
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const acceptLead = useAcceptLead({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: t("Lead accepted", "Lead aceptado"),
          description: `${data.asanaMessage} — ${t("project created", "proyecto creado")}: ${data.project.name}`,
        });
        qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        setSelectedId(null);
      },
      onError: () => {
        toast({
          title: t("Failed to accept lead", "No se pudo aceptar"),
          variant: "destructive",
        });
      },
    },
  });

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      return true;
    });
  }, [leads, sourceFilter, statusFilter]);

  const newCount = leads.filter((l) => l.status === "new").length;
  const avgScore = leads.length ? Math.round(leads.reduce((a, l) => a + l.score, 0) / leads.length) : 0;

  const sourceBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    leads.forEach((l) => { totals[l.source] = (totals[l.source] ?? 0) + 1; });
    return totals;
  }, [leads]);

  const selected = filtered.find((l) => l.id === selectedId) ?? leads.find((l) => l.id === selectedId);

  return (
    <RequireRole roles={["admin", "architect", "superadmin"]}>
      <AppLayout>
        <div className="space-y-6" data-testid="leads-page">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {t("Leads", "Leads")}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {t("Public intake form submissions, scored automatically.", "Solicitudes públicas, puntuadas automáticamente.")}
              </p>
            </div>
            <div className="flex gap-3">
              <div className="bg-card border border-card-border rounded-lg px-4 py-2.5">
                <div className="text-xs text-muted-foreground">{t("New", "Nuevos")}</div>
                <div className="text-xl font-bold text-konti-olive" data-testid="stat-new">{newCount}</div>
              </div>
              <div className="bg-card border border-card-border rounded-lg px-4 py-2.5">
                <div className="text-xs text-muted-foreground">{t("Avg Score", "Score Prom.")}</div>
                <div className="text-xl font-bold text-foreground" data-testid="stat-avg">{avgScore}</div>
              </div>
              <div className="bg-card border border-card-border rounded-lg px-4 py-2.5">
                <div className="text-xs text-muted-foreground">{t("Total", "Total")}</div>
                <div className="text-xl font-bold text-foreground" data-testid="stat-total">{leads.length}</div>
              </div>
            </div>
          </div>

          {/* Lead-score legend (#74) — inline tier guide */}
          <div className="bg-card border border-card-border rounded-xl p-4" data-testid="score-legend">
            <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
              {t("Lead score legend", "Leyenda de score")}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {SCORE_LEGEND.map((tier) => (
                <div
                  key={tier.range}
                  data-testid={`legend-tier-${tier.label.toLowerCase()}`}
                  className="flex items-start gap-2.5 px-2.5 py-2 rounded-md border border-border/60 bg-muted/20"
                >
                  <div className={`w-9 h-9 rounded-md ${tier.color} text-white flex flex-col items-center justify-center shrink-0`}>
                    <div className="text-[10px] font-bold leading-none">{tier.range.split("–")[0]}+</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-foreground">
                      {t(tier.label, tier.labelEs)} <span className="text-muted-foreground font-normal">· {tier.range}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                      {t(tier.hint, tier.hintEs)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Source breakdown */}
          <div className="bg-card border border-card-border rounded-xl p-4">
            <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
              {t("Source breakdown", "Origen de leads")}
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SOURCE_META).map(([key, meta]) => {
                const Icon = meta.icon;
                const count = sourceBreakdown[key] ?? 0;
                return (
                  <div key={key} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.color}`}>
                    <Icon className="w-3 h-3" />
                    <span>{t(meta.label, meta.labelEs)}</span>
                    <span className="font-bold">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="w-3.5 h-3.5" /> {t("Filter:", "Filtrar:")}
            </div>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              data-testid="filter-source"
              className="text-sm rounded-md border border-input bg-card px-2.5 py-1.5"
            >
              <option value="all">{t("All sources", "Todos los orígenes")}</option>
              {Object.entries(SOURCE_META).map(([k, m]) => (
                <option key={k} value={k}>{t(m.label, m.labelEs)}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              data-testid="filter-status"
              className="text-sm rounded-md border border-input bg-card px-2.5 py-1.5"
            >
              <option value="all">{t("All statuses", "Todos")}</option>
              <option value="new">{t("New", "Nuevo")}</option>
              <option value="contacted">{t("Contacted", "Contactado")}</option>
              <option value="accepted">{t("Accepted", "Aceptado")}</option>
            </select>
          </div>

          {/* Leads list */}
          {isLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-20 bg-card rounded-xl border animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-12 text-center text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">{t("No leads match these filters.", "Ningún lead coincide con los filtros.")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((lead) => {
                const meta = SOURCE_META[lead.source];
                const SourceIcon = meta?.icon ?? Globe;
                const typeLabel = TYPE_LABEL[lead.projectType];
                return (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedId(lead.id)}
                    data-testid={`lead-row-${lead.id}`}
                    className="bg-card border border-card-border rounded-xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:shadow-md transition-shadow cursor-pointer"
                  >
                    {/* Score badge */}
                    <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex flex-col items-center justify-center text-white shrink-0 ${scoreColor(lead.score)}`}>
                      <div className="text-lg font-bold leading-none">{lead.score}</div>
                      <div className="text-[9px] opacity-80 mt-0.5 uppercase tracking-wider">score</div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-bold text-foreground truncate">{lead.contactName}</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${STATUS_COLOR[lead.status]}`}>
                          {lead.status}
                        </span>
                        {lead.asanaGid && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-mono flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" /> ASANA {lead.asanaGid}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${meta?.color ?? ""}`}>
                          <SourceIcon className="w-3 h-3" /> {t(meta?.label ?? lead.source, meta?.labelEs ?? lead.source)}
                        </span>
                        <span className="font-medium text-foreground">
                          {typeLabel ? t(typeLabel.en, typeLabel.es) : lead.projectType}
                        </span>
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {lead.location}</span>
                        <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {BUDGET_LABEL[lead.budgetRange]}</span>
                      </div>
                    </div>

                    <button
                      className="text-xs px-2 sm:px-3 py-1.5 rounded-md text-konti-olive hover:bg-konti-olive/10 shrink-0"
                      onClick={(e) => { e.stopPropagation(); setSelectedId(lead.id); }}
                    >
                      {t("View →", "Ver →")}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail drawer */}
        {selected && (
          <div className="fixed inset-0 z-50 flex" data-testid="lead-drawer">
            <div className="flex-1 bg-black/40" onClick={() => setSelectedId(null)} />
            <div className="w-full max-w-md bg-card h-full overflow-y-auto shadow-xl">
              <div className="p-5 border-b border-card-border flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm ${scoreColor(selected.score)}`}>
                      {selected.score}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-foreground" data-testid="drawer-name">{selected.contactName}</h2>
                      <p className="text-xs text-muted-foreground">
                        {new Date(selected.createdAt).toLocaleString(lang === "es" ? "es-PR" : "en-US")}
                      </p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-sm">
                <div className="grid grid-cols-1 gap-2.5">
                  <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /> <span className="text-foreground">{selected.email}</span></div>
                  <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /> <span className="text-foreground">{selected.phone}</span></div>
                  <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /> <span className="text-foreground">{selected.location}</span></div>
                </div>

                <div className="border-t border-card-border pt-4 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("Project type", "Tipo")}</div>
                    <div className="font-medium">
                      {TYPE_LABEL[selected.projectType] ? t(TYPE_LABEL[selected.projectType]!.en, TYPE_LABEL[selected.projectType]!.es) : selected.projectType}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("Budget", "Presupuesto")}</div>
                    <div className="font-medium">{BUDGET_LABEL[selected.budgetRange]}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1"><Mountain className="w-3 h-3" /> {t("Land", "Terreno")}</div>
                    <div className="font-medium">
                      {TERRAIN_LABEL[selected.terrainStatus] ? t(TERRAIN_LABEL[selected.terrainStatus]!.en, TERRAIN_LABEL[selected.terrainStatus]!.es) : selected.terrainStatus}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("Source", "Origen")}</div>
                    <div className="font-medium capitalize">{selected.source}</div>
                  </div>
                </div>

                {selected.notes && (
                  <div className="border-t border-card-border pt-4">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("Notes", "Notas")}</div>
                    <p className="text-sm text-foreground">{selected.notes}</p>
                  </div>
                )}

                {selected.booking && (
                  <div className="border-t border-card-border pt-4">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      {t("Booked consultation", "Consulta reservada")}
                    </div>
                    <div className="bg-konti-olive/10 border border-konti-olive/30 rounded-lg p-3">
                      <div className="font-medium text-foreground">{selected.booking.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {selected.booking.type === "consultation_30min"
                          ? t("1:1 — 30 min", "1:1 — 30 min")
                          : t("Group seminar", "Seminario grupal")}
                      </div>
                    </div>
                  </div>
                )}

                {selected.asanaGid && (
                  <div className="border-t border-card-border pt-4">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("ASANA Task", "Tarea ASANA")}</div>
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                      <span className="font-mono text-orange-700">{selected.asanaGid}</span>
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>

              {selected.status !== "accepted" && (
                <div className="p-5 border-t border-card-border sticky bottom-0 bg-card">
                  <button
                    onClick={() => acceptLead.mutate({ id: selected.id })}
                    disabled={acceptLead.isPending}
                    data-testid="btn-accept-lead"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {acceptLead.isPending
                      ? t("Creating project...", "Creando proyecto...")
                      : t("Accept → Create Discovery project", "Aceptar → Crear proyecto Discovery")}
                  </button>
                  <p className="text-[11px] text-muted-foreground text-center mt-2">
                    {t("This will create a synthetic ASANA task and a new Discovery-phase project.", "Esto crea una tarea ASANA sintética y un nuevo proyecto en fase Descubrimiento.")}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </AppLayout>
    </RequireRole>
  );
}
