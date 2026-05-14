// P6.2 UI — Contractor monitoring panel with the 5 standardized sections
// from file `2b)` Contractor Monitoring Report. Replaces the single-line
// status pill in the existing `contractor-monitoring-section.tsx` with a
// per-contractor expandable card.
//
// Each contractor row tracks:
//   - startDate / initialFinishDate (header)
//   - approvedDelayDays (computed sum of Approved delays + climate)
//   - newFinishDate (computed)
//   - 5 sections: Notable Delays, Change Orders, Climate Conditions,
//     Breach of Contract, Corrective Actions

import { useEffect, useState, useCallback } from "react";
import { useLang } from "@/hooks/use-lang";
import { useToast } from "@/hooks/use-toast";
import { useListContractors, type Contractor } from "@workspace/api-client-react";
import { AlertTriangle, ClipboardList, Loader2, Plus } from "lucide-react";

type Section =
  | "notable_delays"
  | "change_orders"
  | "climate_conditions"
  | "breach_of_contract"
  | "corrective_actions";

const SECTIONS: { key: Section; en: string; es: string }[] = [
  { key: "notable_delays", en: "Notable Delays", es: "Retrasos Notables" },
  { key: "change_orders", en: "Change Orders", es: "Órdenes de Cambio" },
  { key: "climate_conditions", en: "Climate Conditions", es: "Condiciones Climáticas" },
  { key: "breach_of_contract", en: "Breach of Contract", es: "Incumplimiento" },
  { key: "corrective_actions", en: "Corrective Actions", es: "Acciones Correctivas" },
];

interface MonEntry {
  id: string;
  section: Section;
  date: string;
  description: string;
  status: string;
  days?: number;
  notes?: string;
  evidenceLink?: string;
  createdAt: string;
}

interface Monitoring {
  projectId: string;
  contractorId: string;
  startDate?: string;
  initialFinishDate?: string;
  approvedDelayDays: number;
  newFinishDate?: string;
  entries: MonEntry[];
}

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

export function ContractorMonitoringPanel({ projectId }: { projectId: string }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const { data: contractors = [] } = useListContractors();
  const [activeContractorId, setActiveContractorId] = useState<string>("");
  const [monitoring, setMonitoring] = useState<Monitoring | null>(null);
  const [loading, setLoading] = useState(false);

  // Form state for adding a new entry.
  const [section, setSection] = useState<Section>("notable_delays");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"Approved" | "Denied" | "Pending">("Pending");
  const [days, setDays] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const loadMonitoring = useCallback(async (contractorId: string) => {
    if (!contractorId) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/projects/${projectId}/contractor-monitoring/${contractorId}`);
      if (!res.ok) throw new Error("load_failed");
      setMonitoring(await res.json());
    } catch {
      setMonitoring(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (activeContractorId) void loadMonitoring(activeContractorId);
  }, [activeContractorId, loadMonitoring]);

  const updateHeader = async (patch: { startDate?: string; initialFinishDate?: string }) => {
    if (!activeContractorId) return;
    try {
      const res = await authedFetch(
        `/api/projects/${projectId}/contractor-monitoring/${activeContractorId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) throw new Error("save_failed");
      setMonitoring(await res.json());
    } catch {
      toast({ title: t("Save failed", "Falló al guardar"), variant: "destructive" });
    }
  };

  const addEntry = async () => {
    if (!activeContractorId || !description.trim()) {
      toast({ title: t("Description required", "Descripción requerida"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await authedFetch(
        `/api/projects/${projectId}/contractor-monitoring/${activeContractorId}/entries`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section,
            date,
            description: description.trim(),
            status,
            ...(days.trim() && isFinite(Number(days)) ? { days: Number(days) } : {}),
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          }),
        },
      );
      if (!res.ok) throw new Error("create_failed");
      const data = await res.json();
      setMonitoring(data.monitoring);
      setDescription(""); setDays(""); setNotes(""); setStatus("Pending");
      toast({ title: t("Entry added", "Entrada agregada") });
    } catch {
      toast({ title: t("Could not add entry", "No se pudo agregar"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-card rounded-xl border border-card-border shadow-sm p-5" data-testid="contractor-monitoring-panel">
      <header className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-konti-olive" />
          {t("Contractor Monitoring", "Monitoreo del Contratista")}
        </h2>
        <select
          value={activeContractorId}
          onChange={(e) => setActiveContractorId(e.target.value)}
          data-testid="monitoring-contractor"
          className="px-3 py-2 rounded-md border border-input bg-background text-sm"
        >
          <option value="">{t("Pick a contractor", "Elegir contratista")}</option>
          {contractors.map((c: Contractor) => (
            <option key={c.id} value={c.id}>{c.name} — {c.trade}</option>
          ))}
        </select>
      </header>

      {!activeContractorId ? (
        <p className="text-xs text-muted-foreground py-3">
          {t("Pick a contractor above to view their monitoring record.", "Selecciona un contratista para ver su registro.")}
        </p>
      ) : loading ? (
        <p className="text-xs text-muted-foreground py-3">{t("Loading…", "Cargando…")}</p>
      ) : monitoring ? (
        <>
          {/* Header */}
          <div className="bg-konti-dark text-konti-light rounded-lg p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <label className="block">
              <span className="text-white/70 block mb-1">{t("Start date", "Fecha de inicio")}</span>
              <input
                type="date"
                value={monitoring.startDate ?? ""}
                onChange={(e) => updateHeader({ startDate: e.target.value })}
                data-testid="monitoring-start-date"
                className="w-full px-2 py-1 rounded bg-konti-light text-konti-dark"
              />
            </label>
            <label className="block">
              <span className="text-white/70 block mb-1">{t("Initial finish", "Finalización inicial")}</span>
              <input
                type="date"
                value={monitoring.initialFinishDate ?? ""}
                onChange={(e) => updateHeader({ initialFinishDate: e.target.value })}
                data-testid="monitoring-initial-finish"
                className="w-full px-2 py-1 rounded bg-konti-light text-konti-dark"
              />
            </label>
            <div>
              <span className="text-white/70 block mb-1">{t("Approved delay days", "Días retraso aprobados")}</span>
              <span className="font-bold text-konti-olive" data-testid="monitoring-approved-days">{monitoring.approvedDelayDays}</span>
            </div>
            <div>
              <span className="text-white/70 block mb-1">{t("New finish date", "Nueva finalización")}</span>
              <span className="font-bold" data-testid="monitoring-new-finish">{monitoring.newFinishDate ?? "—"}</span>
            </div>
          </div>

          {/* Add-entry form */}
          <div className="border border-border rounded-md p-3 mb-3" data-testid="monitoring-add-form">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
              <select
                value={section}
                onChange={(e) => setSection(e.target.value as Section)}
                data-testid="monitoring-section"
                className="px-2 py-1.5 rounded border border-input bg-background text-xs"
              >
                {SECTIONS.map((s) => (
                  <option key={s.key} value={s.key}>{lang === "es" ? s.es : s.en}</option>
                ))}
              </select>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="monitoring-entry-date"
                className="px-2 py-1.5 rounded border border-input bg-background text-xs"
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "Approved" | "Denied" | "Pending")}
                data-testid="monitoring-entry-status"
                className="px-2 py-1.5 rounded border border-input bg-background text-xs"
              >
                <option value="Pending">{t("Pending", "Pendiente")}</option>
                <option value="Approved">{t("Approved", "Aprobado")}</option>
                <option value="Denied">{t("Denied", "Denegado")}</option>
              </select>
              <input
                type="number"
                min={0}
                step="1"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder={t("Days", "Días")}
                data-testid="monitoring-entry-days"
                className="px-2 py-1.5 rounded border border-input bg-background text-xs text-right"
              />
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("Description…", "Descripción…")}
              rows={2}
              maxLength={500}
              data-testid="monitoring-entry-description"
              className="w-full px-2 py-1.5 rounded border border-input bg-background text-xs mb-2"
            />
            <button
              type="button"
              onClick={addEntry}
              disabled={busy || !description.trim()}
              data-testid="btn-add-monitoring-entry"
              className="w-full md:w-auto px-3 py-1.5 rounded-md bg-konti-olive text-white text-xs font-semibold hover:bg-konti-olive/90 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              {t("Add entry", "Agregar entrada")}
            </button>
          </div>

          {/* Sections */}
          {SECTIONS.map((s) => {
            const entries = monitoring.entries.filter((e) => e.section === s.key);
            if (entries.length === 0) return null;
            return (
              <div key={s.key} className="mb-3" data-testid={`monitoring-section-${s.key}`}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {lang === "es" ? s.es : s.en}
                  <span className="font-normal">({entries.length})</span>
                </h3>
                <ul className="space-y-1.5">
                  {entries.map((e) => (
                    <li
                      key={e.id}
                      data-testid={`monitoring-entry-${e.id}`}
                      className="border border-border rounded-md p-2 text-xs bg-muted/20"
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="font-medium text-foreground">{e.date}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          e.status === "Approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : e.status === "Denied"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                        }`}>
                          {e.status}
                        </span>
                        {typeof e.days === "number" && (
                          <span className="text-[10px] text-muted-foreground">
                            {e.days} {t("days", "días")}
                          </span>
                        )}
                      </div>
                      <p className="text-foreground/90 leading-relaxed">{e.description}</p>
                      {e.notes && <p className="text-muted-foreground italic mt-0.5">{e.notes}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      ) : (
        <p className="text-xs text-muted-foreground py-3">
          {t("Could not load monitoring record.", "No se pudo cargar el registro.")}
        </p>
      )}
    </section>
  );
}
