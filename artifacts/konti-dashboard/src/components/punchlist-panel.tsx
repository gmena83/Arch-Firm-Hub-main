import { useState, useEffect, useCallback } from "react";
import {
  advanceProjectPhase,
  createProjectPunchlistItem,
  deleteProjectPunchlistItem,
  listProjectPunchlist,
  setProjectPunchlistItemStatus,
  type PunchlistItem,
  type PunchlistItemStatus,
  type PunchlistOpenError,
  type PunchlistResponse,
} from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { resolveSeedImageUrl } from "@/lib/seed-image-url";
import { ListChecks, Plus, X, Check, Clock, AlertCircle, ShieldOff, Trash2, ArrowRight, Loader2, Image as ImageIcon } from "lucide-react";

type PunchlistStatus = PunchlistItemStatus;

function StatusPill({ status }: { status: PunchlistStatus }) {
  const { t } = useLang();
  const config: Record<PunchlistStatus, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    open: { bg: "bg-amber-100", text: "text-amber-800", icon: <AlertCircle className="w-3 h-3" />, label: t("Open", "Abierto") },
    in_progress: { bg: "bg-sky-100", text: "text-sky-800", icon: <Clock className="w-3 h-3" />, label: t("In Progress", "En Progreso") },
    done: { bg: "bg-emerald-100", text: "text-emerald-800", icon: <Check className="w-3 h-3" />, label: t("Done", "Listo") },
    waived: { bg: "bg-slate-200", text: "text-slate-700", icon: <ShieldOff className="w-3 h-3" />, label: t("Waived", "Renunciado") },
  };
  const c = config[status];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 ${c.bg} ${c.text}`} data-testid={`punchlist-status-${status}`}>
      {c.icon} {c.label}
    </span>
  );
}

function AddItemDialog({ projectId, phase, onClose, onCreated }: { projectId: string; phase: string; onClose: () => void; onCreated: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [labelEs, setLabelEs] = useState("");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!label.trim() || !labelEs.trim() || !owner.trim()) {
      toast({ title: t("Label (EN/ES) and owner required", "Etiqueta (EN/ES) y responsable requeridos"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await createProjectPunchlistItem(projectId, {
        label,
        labelEs,
        owner,
        dueDate: dueDate || undefined,
        phase,
      });
      toast({ title: t("Punchlist item added", "Ítem de punchlist agregado") });
      onCreated();
      onClose();
    } catch {
      toast({ title: t("Failed to add item", "Error al agregar ítem"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="punchlist-add-dialog">
      <div className="bg-card rounded-xl border border-card-border shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">{t("Add Punchlist Item", "Agregar Ítem de Punchlist")}</h3>
          <button onClick={onClose} data-testid="btn-close-punchlist-add"><X className="w-5 h-5" /></button>
        </div>
        {/* L-5 — label `htmlFor` paired with input `id` so screen-readers
            announce the field name on focus. */}
        <div className="space-y-3">
          <div>
            <label htmlFor="punchlist-label-en" className="block text-xs font-semibold text-muted-foreground mb-1">{t("Label (English)", "Etiqueta (Inglés)")}</label>
            <input
              id="punchlist-label-en"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              data-testid="input-punchlist-label-en"
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              placeholder="Re-seal master shower silicone"
            />
          </div>
          <div>
            <label htmlFor="punchlist-label-es" className="block text-xs font-semibold text-muted-foreground mb-1">{t("Label (Spanish)", "Etiqueta (Español)")}</label>
            <input
              id="punchlist-label-es"
              value={labelEs}
              onChange={(e) => setLabelEs(e.target.value)}
              data-testid="input-punchlist-label-es"
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              placeholder="Resellar silicona de la ducha principal"
            />
          </div>
          <div>
            <label htmlFor="punchlist-owner" className="block text-xs font-semibold text-muted-foreground mb-1">{t("Owner", "Responsable")}</label>
            <input
              id="punchlist-owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              data-testid="input-punchlist-owner"
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              placeholder="Jorge Rosa"
            />
          </div>
          <div>
            <label htmlFor="punchlist-due" className="block text-xs font-semibold text-muted-foreground mb-1">{t("Due Date (optional)", "Fecha límite (opcional)")}</label>
            <input
              id="punchlist-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              data-testid="input-punchlist-due"
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
            />
          </div>
          <button
            onClick={submit}
            disabled={busy}
            data-testid="btn-submit-punchlist"
            className="w-full py-2 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("Add Item", "Agregar Ítem")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PunchlistPanel({
  projectId,
  currentPhase,
  isClientView,
  onAdvanced,
}: {
  projectId: string;
  currentPhase: string;
  isClientView: boolean;
  onAdvanced?: () => void | Promise<void>;
}) {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<PunchlistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const canEdit = !isClientView && user?.role !== "client";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const d: PunchlistResponse = await listProjectPunchlist(projectId, { phase: currentPhase });
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, currentPhase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function setStatus(item: PunchlistItem, status: PunchlistStatus) {
    let waiverReason: string | undefined;
    if (status === "waived") {
      const reason = window.prompt(
        t("Justification for waiving this item (required, ≥3 chars):", "Justificación para renunciar a este ítem (requerido, ≥3 caracteres):") ?? "",
        "",
      );
      if (reason === null) return;
      if (reason.trim().length < 3) {
        toast({ title: t("Justification too short", "Justificación demasiado corta"), variant: "destructive" });
        return;
      }
      waiverReason = reason.trim();
    }
    setBusyItemId(item.id);
    try {
      await setProjectPunchlistItemStatus(projectId, item.id, { status, waiverReason });
      toast({ title: t("Item updated", "Ítem actualizado") });
      await refresh();
    } catch {
      toast({ title: t("Update failed", "Actualización falló"), variant: "destructive" });
    } finally {
      setBusyItemId(null);
    }
  }

  async function deleteItem(item: PunchlistItem) {
    if (!window.confirm(t(`Delete "${item.label}"?`, `¿Eliminar "${item.labelEs}"?`))) return;
    setBusyItemId(item.id);
    try {
      await deleteProjectPunchlistItem(projectId, item.id);
      await refresh();
    } catch {
      toast({ title: t("Delete failed", "Eliminación falló"), variant: "destructive" });
    } finally {
      setBusyItemId(null);
    }
  }

  async function advancePhase() {
    setAdvancing(true);
    try {
      await advanceProjectPhase(projectId);
      toast({ title: t("Phase advanced", "Fase avanzada") });
      // Notify parent so it can invalidate the project query; the new phase will
      // propagate down via the currentPhase prop and trigger a punchlist refresh.
      await onAdvanced?.();
    } catch (err) {
      // The structured 400 from advance-phase may be either a generic
      // ErrorResponse or a PunchlistOpenError — read whichever fields exist.
      const e = err as { status?: number; data?: Partial<PunchlistOpenError> & { message?: string; messageEs?: string } };
      const msg = lang === "es" ? e?.data?.messageEs : e?.data?.message;
      toast({
        title: t("Cannot advance phase", "No se puede avanzar la fase"),
        description: msg ?? t("Unknown error", "Error desconocido"),
        variant: "destructive",
      });
    } finally {
      setAdvancing(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="punchlist-panel-loading">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> {t("Loading punchlist…", "Cargando punchlist…")}
        </div>
      </div>
    );
  }

  if (!data || data.totalCount === 0) {
    if (!canEdit) return null; // hide for clients when empty
    return (
      <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="punchlist-panel">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-konti-olive" />
            {t("Phase Punchlist", "Punchlist de la Fase")}
          </h2>
          <button
            onClick={() => setShowAdd(true)}
            data-testid="btn-add-punchlist-empty"
            className="text-xs px-3 py-1.5 rounded-md border border-konti-olive text-konti-olive hover:bg-konti-olive/10 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> {t("Add Item", "Agregar Ítem")}
          </button>
        </div>
        <p className="text-sm text-muted-foreground">{t("No punchlist items for this phase yet.", "Aún no hay ítems de punchlist para esta fase.")}</p>
        {showAdd && <AddItemDialog projectId={projectId} phase={currentPhase} onClose={() => setShowAdd(false)} onCreated={refresh} />}
      </div>
    );
  }

  const { items, openCount, doneCount, waivedCount, totalCount } = data;
  const completedOrWaived = doneCount + waivedCount;
  const progressPct = totalCount > 0 ? Math.round((completedOrWaived / totalCount) * 100) : 0;
  const blocked = openCount > 0;
  const isFinalPhase = currentPhase === "completed";

  return (
    <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="punchlist-panel">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-konti-olive" />
          {t("Phase Punchlist", "Punchlist de la Fase")}
          <span className="text-xs font-normal text-muted-foreground">
            ({completedOrWaived} {t("of", "de")} {totalCount} {t("complete", "completos")})
          </span>
        </h2>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            data-testid="btn-add-punchlist"
            className="text-xs px-3 py-1.5 rounded-md border border-konti-olive text-konti-olive hover:bg-konti-olive/10 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> {t("Add", "Agregar")}
          </button>
        )}
      </div>

      <div className="mb-4">
        <div className="h-2 bg-muted rounded-full overflow-hidden" data-testid="punchlist-progress-bar">
          <div
            className={`h-full transition-all ${blocked ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
          <span data-testid="punchlist-summary">
            {openCount} {t("open", "abiertos")} · {doneCount} {t("done", "listos")} · {waivedCount} {t("waived", "renunciados")}
          </span>
          <span>{progressPct}%</span>
        </div>
      </div>

      <div className="space-y-4 mb-4 max-h-[640px] overflow-y-auto pr-1" data-testid="punchlist-items-container">
        {(() => {
          // Task #158 / C-01 — Group items by `category` (preserving the
          // server-provided order within each group) with a sticky header per
          // category. Items missing a category fall into "Other / Otros".
          const groups: Array<{ key: string; label: string; labelEs: string; rows: PunchlistItem[] }> = [];
          const indexByKey = new Map<string, number>();
          for (const it of items) {
            const key = it.category ?? "__uncategorized";
            const label = it.category ?? t("Other", "Otros");
            const labelEs = it.categoryEs ?? it.category ?? t("Other", "Otros");
            let i = indexByKey.get(key);
            if (i === undefined) {
              i = groups.length;
              indexByKey.set(key, i);
              groups.push({ key, label, labelEs, rows: [] });
            }
            groups[i].rows.push(it);
          }
          return groups.map((g) => (
            <div key={g.key} data-testid={`punchlist-group-${g.key}`} className="space-y-2">
              <div
                className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-card/95 backdrop-blur border-b border-border"
                data-testid={`punchlist-group-header-${g.key}`}
              >
                <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center justify-between">
                  <span>{lang === "es" ? g.labelEs : g.label}</span>
                  <span className="text-muted-foreground/70">{g.rows.length}</span>
                </p>
              </div>
              {g.rows.map((item) => {
                const thumb = item.photoUrl ? resolveSeedImageUrl(item.photoUrl) : undefined;
                return (
          <div
            key={item.id}
            data-testid={`punchlist-item-${item.id}`}
            className="rounded-lg border border-border bg-muted/20 p-3 flex items-start gap-3"
          >
            {thumb ? (
              <a
                href={thumb}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("Open full photo in new tab", "Abrir foto completa en una nueva pestaña")}
                data-testid={`punchlist-thumb-link-${item.id}`}
                className="shrink-0 rounded border border-border overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <img
                  src={thumb}
                  alt=""
                  loading="lazy"
                  data-testid={`punchlist-thumb-${item.id}`}
                  className="w-12 h-12 object-cover hover:opacity-90 transition-opacity"
                />
              </a>
            ) : (
              <div
                aria-hidden="true"
                data-testid={`punchlist-thumb-placeholder-${item.id}`}
                className="w-12 h-12 rounded border border-dashed border-border bg-muted/40 shrink-0 flex items-center justify-center text-muted-foreground/50"
              >
                <ImageIcon className="w-5 h-5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {lang === "es" ? item.labelEs : item.label}
              </p>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                <StatusPill status={item.status} />
                <span>{item.owner}</span>
                {item.dueDate && <span>· {t("Due", "Vence")} {item.dueDate}</span>}
              </div>
              {item.status === "waived" && item.waiverReason && (
                <p className="text-xs italic text-slate-600 mt-1.5" data-testid={`punchlist-waiver-${item.id}`}>
                  <ShieldOff className="w-3 h-3 inline mr-1" />
                  {t("Waived:", "Renunciado:")} {item.waiverReason}
                </p>
              )}
            </div>
            {canEdit && (
              <div className="flex items-center gap-1 shrink-0">
                {item.status !== "in_progress" && item.status !== "done" && item.status !== "waived" && (
                  <button
                    onClick={() => setStatus(item, "in_progress")}
                    disabled={busyItemId === item.id}
                    data-testid={`btn-punchlist-start-${item.id}`}
                    title={t("Mark in progress", "Marcar en progreso")}
                    className="p-1.5 rounded-md text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                )}
                {item.status !== "done" && (
                  <button
                    onClick={() => setStatus(item, "done")}
                    disabled={busyItemId === item.id}
                    data-testid={`btn-punchlist-done-${item.id}`}
                    title={t("Mark done", "Marcar como listo")}
                    className="p-1.5 rounded-md text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
                {item.status !== "waived" && item.status !== "done" && (
                  <button
                    onClick={() => setStatus(item, "waived")}
                    disabled={busyItemId === item.id}
                    data-testid={`btn-punchlist-waive-${item.id}`}
                    title={t("Waive (requires justification)", "Renunciar (requiere justificación)")}
                    className="p-1.5 rounded-md text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                  >
                    <ShieldOff className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => deleteItem(item)}
                  disabled={busyItemId === item.id}
                  data-testid={`btn-punchlist-delete-${item.id}`}
                  title={t("Delete", "Eliminar")}
                  className="p-1.5 rounded-md text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
                );
              })}
            </div>
          ));
        })()}
      </div>

      {canEdit && !isFinalPhase && (
        <div className="border-t border-border pt-4">
          {blocked && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2 inline-flex items-start gap-1.5" data-testid="punchlist-block-reason">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {t(
                  `${openCount} open item(s) must be completed or waived before advancing the phase.`,
                  `${openCount} ítem(s) abierto(s) deben completarse o renunciarse antes de avanzar la fase.`,
                )}
              </span>
            </p>
          )}
          <button
            onClick={advancePhase}
            disabled={blocked || advancing}
            data-testid="btn-advance-phase-from-punchlist"
            className="w-full py-2.5 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {advancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {t("Advance Phase", "Avanzar Fase")}
          </button>
        </div>
      )}

      {showAdd && <AddItemDialog projectId={projectId} phase={currentPhase} onClose={() => setShowAdd(false)} onCreated={refresh} />}
    </div>
  );
}

export default PunchlistPanel;
