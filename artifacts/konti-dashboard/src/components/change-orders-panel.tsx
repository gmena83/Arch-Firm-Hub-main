import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProjectChangeOrders,
  useCreateChangeOrder,
  useUpdateChangeOrder,
  useSetChangeOrderStatus,
  getGetProjectChangeOrdersQueryKey,
  type ChangeOrder,
  SetChangeOrderStatusBodyStatus,
} from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Plus, X, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Pencil } from "lucide-react";

type COStatus = ChangeOrder["status"];

const CO_STATUS_VALUES = Object.values(SetChangeOrderStatusBodyStatus);
const parseCOStatus = (value: string): SetChangeOrderStatusBodyStatus | null =>
  (CO_STATUS_VALUES as readonly string[]).includes(value)
    ? (value as SetChangeOrderStatusBodyStatus)
    : null;

const STATUS_BADGE: Record<COStatus, { bg: string; label: { en: string; es: string }; icon: React.ReactNode }> = {
  pending: { bg: "bg-amber-100 text-amber-800 border-amber-200", label: { en: "Pending", es: "Pendiente" }, icon: <Clock className="w-3 h-3" /> },
  approved: { bg: "bg-emerald-100 text-emerald-800 border-emerald-200", label: { en: "Approved", es: "Aprobada" }, icon: <CheckCircle className="w-3 h-3" /> },
  rejected: { bg: "bg-red-100 text-red-800 border-red-200", label: { en: "Rejected", es: "Rechazada" }, icon: <XCircle className="w-3 h-3" /> },
};

function CreateCOModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateChangeOrder();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [outsideOfScope, setOutsideOfScope] = useState(false);

  const submit = async () => {
    if (!title.trim() || !amount.trim()) return;
    const amt = Number(amount);
    const d = Number(days || "0");
    if (!isFinite(amt)) {
      toast({ title: t("Invalid amount", "Monto inválido"), variant: "destructive" });
      return;
    }
    try {
      await createMutation.mutateAsync({
        projectId,
        data: {
          title: title.trim(),
          titleEs: title.trim(),
          description: reason.trim(),
          descriptionEs: reason.trim(),
          amountDelta: amt,
          scheduleImpactDays: d,
          reason: reason.trim(),
          reasonEs: reason.trim(),
          outsideOfScope,
        },
      });
      toast({ title: t("Change order created", "Orden de cambio creada") });
      await queryClient.invalidateQueries({ queryKey: getGetProjectChangeOrdersQueryKey(projectId) });
      onClose();
    } catch {
      toast({ title: t("Could not create", "No se pudo crear"), variant: "destructive" });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="co-create-modal">
      <div className="bg-card rounded-xl border border-card-border shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{t("New Change Order", "Nueva Orden de Cambio")}</h2>
          <button onClick={onClose} data-testid="btn-close-co-create"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">{t("Title", "Título")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-co-title"
              className="w-full mt-1 px-3 py-2 border border-border rounded-md text-sm bg-background"
              placeholder={t("e.g. Upgrade roofing material", "p.ej. Mejora del material del techo")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{t("Amount Δ ($)", "Monto Δ ($)")}</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="input-co-amount"
                type="number"
                className="w-full mt-1 px-3 py-2 border border-border rounded-md text-sm bg-background"
                placeholder="3500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{t("Days impact", "Días de impacto")}</label>
              <input
                value={days}
                onChange={(e) => setDays(e.target.value)}
                data-testid="input-co-days"
                type="number"
                min="0"
                className="w-full mt-1 px-3 py-2 border border-border rounded-md text-sm bg-background"
                placeholder="3"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">{t("Reason", "Razón")}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="input-co-reason"
              rows={3}
              className="w-full mt-1 px-3 py-2 border border-border rounded-md text-sm bg-background"
              placeholder={t("Brief justification…", "Justificación breve…")}
            />
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={outsideOfScope}
              onChange={(e) => setOutsideOfScope(e.target.checked)}
              data-testid="input-co-outside-scope"
              className="mt-0.5"
            />
            <span className="text-xs text-foreground">
              <strong>{t("Outside of original scope", "Fuera del alcance original")}</strong>
              <span className="block text-muted-foreground">{t("Flag this if work falls outside the signed proposal.", "Marca si el trabajo queda fuera de la propuesta firmada.")}</span>
            </span>
          </label>
          <button
            onClick={submit}
            disabled={createMutation.isPending || !title.trim() || !amount.trim()}
            data-testid="btn-submit-co"
            className="w-full py-2.5 bg-konti-olive hover:bg-konti-olive/90 disabled:opacity-50 text-white text-sm font-semibold rounded-md transition-colors"
          >
            {t("Submit Change Order", "Enviar Orden de Cambio")}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditCOModal({ projectId, co, onClose }: { projectId: string; co: ChangeOrder; onClose: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateChangeOrder();
  const [title, setTitle] = useState(co.title);
  const [amount, setAmount] = useState(String(co.amountDelta));
  const [days, setDays] = useState(String(co.scheduleImpactDays));
  const [reason, setReason] = useState(co.reason ?? "");
  const [outsideOfScope, setOutsideOfScope] = useState(!!co.outsideOfScope);

  const submit = async () => {
    const amt = Number(amount);
    const d = Number(days || "0");
    if (!title.trim() || !isFinite(amt)) {
      toast({ title: t("Invalid input", "Entrada inválida"), variant: "destructive" });
      return;
    }
    try {
      await updateMutation.mutateAsync({
        projectId,
        coId: co.id,
        data: {
          title: title.trim(),
          titleEs: title.trim(),
          description: reason.trim(),
          descriptionEs: reason.trim(),
          amountDelta: amt,
          scheduleImpactDays: d,
          reason: reason.trim(),
          reasonEs: reason.trim(),
          outsideOfScope,
        },
      });
      toast({ title: t("Change order updated", "Orden de cambio actualizada") });
      await queryClient.invalidateQueries({ queryKey: getGetProjectChangeOrdersQueryKey(projectId) });
      onClose();
    } catch {
      toast({ title: t("Could not update", "No se pudo actualizar"), variant: "destructive" });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="co-edit-modal">
      <div className="bg-card rounded-xl border border-card-border shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{t("Edit Change Order", "Editar Orden de Cambio")} — {co.number}</h2>
          <button onClick={onClose} data-testid="btn-close-co-edit"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">{t("Title", "Título")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-edit-co-title"
              className="w-full mt-1 px-3 py-2 border border-border rounded-md text-sm bg-background"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{t("Amount Δ ($)", "Monto Δ ($)")}</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="input-edit-co-amount" type="number" className="w-full mt-1 px-3 py-2 border border-border rounded-md text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{t("Days impact", "Días de impacto")}</label>
              <input value={days} onChange={(e) => setDays(e.target.value)} data-testid="input-edit-co-days" type="number" min="0" className="w-full mt-1 px-3 py-2 border border-border rounded-md text-sm bg-background" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">{t("Reason", "Razón")}</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-edit-co-reason" rows={3} className="w-full mt-1 px-3 py-2 border border-border rounded-md text-sm bg-background" />
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={outsideOfScope} onChange={(e) => setOutsideOfScope(e.target.checked)} data-testid="input-edit-co-outside-scope" className="mt-0.5" />
            <span className="text-xs text-foreground">
              <strong>{t("Outside of original scope", "Fuera del alcance original")}</strong>
            </span>
          </label>
          <button onClick={submit} disabled={updateMutation.isPending} data-testid="btn-save-co-edit" className="w-full py-2.5 bg-konti-olive hover:bg-konti-olive/90 disabled:opacity-50 text-white text-sm font-semibold rounded-md transition-colors">
            {t("Save Changes", "Guardar Cambios")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChangeOrdersPanel({ projectId, isClientView, currentPhase }: { projectId: string; isClientView: boolean; currentPhase: string }) {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetProjectChangeOrders(projectId);
  const statusMutation = useSetChangeOrderStatus();

  const [showCreate, setShowCreate] = useState(false);
  const [editingCO, setEditingCO] = useState<ChangeOrder | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) return null;
  if (!data) return null;

  // Visible from schematic_design onward (CO's are most relevant once a contract or design baseline exists)
  const visiblePhases = ["schematic_design", "design_development", "construction_documents", "permits", "construction", "completed"];
  if (!visiblePhases.includes(currentPhase) && data.changeOrders.length === 0) return null;

  const isTeamUser = user?.role !== "client";
  const canManage = isTeamUser && !isClientView;

  const setStatus = async (coId: string, status: SetChangeOrderStatusBodyStatus, note?: string) => {
    if (!canManage || statusMutation.isPending) return;
    try {
      await statusMutation.mutateAsync({ projectId, coId, data: { status, note } });
      toast({ title: t("Status updated", "Estado actualizado") });
      await queryClient.invalidateQueries({ queryKey: getGetProjectChangeOrdersQueryKey(projectId) });
    } catch {
      toast({ title: t("Action failed", "Acción fallida"), variant: "destructive" });
    }
  };

  return (
    <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="change-orders-panel">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-konti-olive" />
          {t("Change Orders", "Órdenes de Cambio")}
        </h2>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            data-testid="btn-create-co"
            className="flex items-center gap-1 text-xs font-semibold text-konti-olive hover:text-konti-olive/80"
          >
            <Plus className="w-3.5 h-3.5" /> {t("New", "Nueva")}
          </button>
        )}
      </div>

      {/* Totals strip — collapses to a single column on phones so the
          currency strings don't overflow / clip. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-center">
          <p className="text-[11px] text-emerald-700 font-medium">{t("Approved Δ", "Aprobado Δ")}</p>
          <p className="text-sm font-bold text-emerald-800">{data.totals.approvedDelta >= 0 ? "+" : "−"}${Math.abs(data.totals.approvedDelta).toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-center">
          <p className="text-[11px] text-amber-700 font-medium">{t("Pending Δ", "Pendiente Δ")}</p>
          <p className="text-sm font-bold text-amber-800">{data.totals.pendingDelta >= 0 ? "+" : "−"}${Math.abs(data.totals.pendingDelta).toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 text-center">
          <p className="text-[11px] text-slate-700 font-medium">{t("Schedule Δ", "Plazo Δ")}</p>
          <p className="text-sm font-bold text-slate-800">+{data.totals.approvedDays}d</p>
        </div>
      </div>

      {data.changeOrders.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">{t("No change orders yet.", "Aún no hay órdenes de cambio.")}</p>
      ) : (
        <div className="space-y-2">
          {data.changeOrders.map((co) => {
            const title = lang === "es" ? (co.titleEs ?? co.title) : co.title;
            const reason = lang === "es" ? co.reasonEs : co.reason;
            const badge = STATUS_BADGE[co.status];
            const expanded = expandedId === co.id;
            return (
              <div key={co.id} data-testid={`co-${co.id}`} className="border border-border rounded-lg">
                <button
                  onClick={() => setExpandedId(expanded ? null : co.id)}
                  className="w-full p-3 hover:bg-muted/30 transition-colors text-left"
                  data-testid={`btn-toggle-co-${co.number}`}
                >
                  {/* Two-row layout on phones (title row + amount/badge row),
                      collapses back to a single row from sm: upward. Keeps the
                      title from being squeezed by the currency string + status
                      badge at 375px. */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-konti-olive shrink-0">{co.number}</span>
                    <span className="flex-1 min-w-0 text-sm font-medium truncate flex items-center gap-2">
                      <span className="truncate">{title}</span>
                      {co.outsideOfScope && (
                        <span data-testid={`co-outside-scope-${co.number}`} className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
                          {t("Out of Scope", "Fuera de Alcance")}
                        </span>
                      )}
                    </span>
                    <span className={`hidden sm:inline text-xs font-semibold ${co.amountDelta >= 0 ? "text-foreground" : "text-emerald-700"}`}>
                      {co.amountDelta >= 0 ? "+" : "−"}${Math.abs(co.amountDelta).toLocaleString()}
                    </span>
                    <span className={`hidden sm:inline-flex text-[11px] px-1.5 py-0.5 rounded border font-semibold items-center gap-1 ${badge.bg}`}>
                      {badge.icon} {lang === "es" ? badge.label.es : badge.label.en}
                    </span>
                    {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 mt-2 sm:hidden pl-7">
                    <span className={`text-xs font-semibold ${co.amountDelta >= 0 ? "text-foreground" : "text-emerald-700"}`}>
                      {co.amountDelta >= 0 ? "+" : "−"}${Math.abs(co.amountDelta).toLocaleString()}
                    </span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded border font-semibold inline-flex items-center gap-1 ${badge.bg}`}>
                      {badge.icon} {lang === "es" ? badge.label.es : badge.label.en}
                    </span>
                  </div>
                </button>
                {expanded && (
                  <div className="border-t border-border px-3 py-3 space-y-2 bg-muted/10">
                    {co.outsideOfScope && (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        <strong>{t("Out of original scope.", "Fuera del alcance original.")}</strong> {t("This change adds work beyond the signed proposal.", "Este cambio agrega trabajo más allá de la propuesta firmada.")}
                      </p>
                    )}
                    {reason && <p className="text-xs text-foreground"><span className="font-semibold">{t("Reason", "Razón")}:</span> {reason}</p>}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{t("Schedule impact", "Impacto en plazo")}: <strong className="text-foreground">+{co.scheduleImpactDays}d</strong></span>
                      {co.requestedBy && <span>{t("Requested by", "Solicitado por")}: <strong className="text-foreground">{co.requestedBy}</strong></span>}
                      {co.requestedAt && <span>{new Date(co.requestedAt).toLocaleDateString(lang === "es" ? "es-PR" : "en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
                    </div>
                    {co.decidedAt && co.decidedBy && (
                      <p className="text-xs text-muted-foreground">
                        {co.status === "approved" ? t("Approved by", "Aprobada por") : t("Rejected by", "Rechazada por")} <strong className="text-foreground">{co.decidedBy}</strong> · {new Date(co.decidedAt).toLocaleDateString(lang === "es" ? "es-PR" : "en-US", { month: "short", day: "numeric" })}
                        {co.decisionNote && <> — “{co.decisionNote}”</>}
                      </p>
                    )}
                    {canManage && (
                      <div className="flex items-center gap-2 pt-2 flex-wrap">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t("Set status", "Cambiar estado")}:</span>
                        <select
                          value={co.status}
                          onChange={(e) => {
                            const next = parseCOStatus(e.target.value);
                            if (next) void setStatus(co.id, next);
                          }}
                          disabled={statusMutation.isPending}
                          data-testid={`select-co-status-${co.number}`}
                          className="text-xs px-2 py-1 border border-border rounded-md bg-background"
                        >
                          <option value={SetChangeOrderStatusBodyStatus.pending}>{t("Pending", "Pendiente")}</option>
                          <option value={SetChangeOrderStatusBodyStatus.approved}>{t("Approved", "Aprobada")}</option>
                          <option value={SetChangeOrderStatusBodyStatus.rejected}>{t("Rejected", "Rechazada")}</option>
                        </select>
                        {co.status === "pending" && (
                          <button
                            onClick={() => setEditingCO(co)}
                            data-testid={`btn-edit-co-${co.number}`}
                            className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-konti-olive hover:text-konti-olive/80"
                          >
                            <Pencil className="w-3 h-3" /> {t("Edit", "Editar")}
                          </button>
                        )}
                      </div>
                    )}
                    {!canManage && co.status === "pending" && (
                      <p className="text-[11px] italic text-muted-foreground">{t("Pending architect / admin review.", "Pendiente de revisión del arquitecto / administrador.")}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateCOModal projectId={projectId} onClose={() => setShowCreate(false)} />}
      {editingCO && <EditCOModal projectId={projectId} co={editingCO} onClose={() => setEditingCO(null)} />}
    </div>
  );
}
