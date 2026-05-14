import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProjectInspections,
  useListStructuralEngineers,
  getListStructuralEngineersQueryKey,
  getGetProjectInspectionsQueryKey,
  customFetch,
  type Inspection,
  type StructuralEngineer,
} from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, Calendar, User, Plus, Send, X, CheckCircle2, AlertTriangle, RotateCcw, Clock, Trash2 } from "lucide-react";

const INSPECTION_TYPES = [
  { value: "foundation", label: "Foundation", labelEs: "Cimientos" },
  { value: "framing", label: "Framing", labelEs: "Estructura" },
  { value: "electrical", label: "Electrical", labelEs: "Eléctrica" },
  { value: "plumbing", label: "Plumbing", labelEs: "Plomería" },
  { value: "final", label: "Final", labelEs: "Final" },
] as const;

function StatusPill({ status }: { status: string }) {
  const { t } = useLang();
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    scheduled: { bg: "bg-sky-100", text: "text-sky-800", icon: <Clock className="w-3 h-3" />, label: t("Scheduled", "Programada") },
    passed: { bg: "bg-emerald-100", text: "text-emerald-800", icon: <CheckCircle2 className="w-3 h-3" />, label: t("Passed", "Aprobada") },
    failed: { bg: "bg-red-100", text: "text-red-800", icon: <AlertTriangle className="w-3 h-3" />, label: t("Failed", "Fallida") },
    re_inspect: { bg: "bg-amber-100", text: "text-amber-800", icon: <RotateCcw className="w-3 h-3" />, label: t("Re-inspect", "Re-inspección") },
  };
  const c = config[status] ?? config["scheduled"]!;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 ${c.bg} ${c.text}`}>
      {c.icon} {c.label}
    </span>
  );
}

function CreateInspectionDialog({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: () => void }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [type, setType] = useState<typeof INSPECTION_TYPES[number]["value"]>("foundation");
  const [inspector, setInspector] = useState("");
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!inspector.trim() || !scheduledDate) {
      toast({ title: t("Inspector and date required", "Inspector y fecha requeridos"), variant: "destructive" });
      return;
    }
    const meta = INSPECTION_TYPES.find((m) => m.value === type)!;
    setSubmitting(true);
    try {
      await customFetch(`/api/projects/${projectId}/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: `${meta.label} Inspection`,
          titleEs: `Inspección de ${meta.labelEs}`,
          inspector,
          scheduledDate,
        }),
      });
      toast({ title: t("Inspection scheduled", "Inspección programada") });
      onCreated();
      onClose();
    } catch {
      toast({ title: t("Failed to schedule", "Error al programar"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="create-inspection-modal">
      <div className="bg-card rounded-xl border border-card-border shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">{t("Schedule Inspection", "Programar Inspección")}</h2>
          <button onClick={onClose} data-testid="btn-close-create-inspection"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">{t("Type", "Tipo")}</label>
            <select
              data-testid="select-inspection-type"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            >
              {INSPECTION_TYPES.map((m) => (
                <option key={m.value} value={m.value}>{lang === "es" ? m.labelEs : m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">{t("Inspector", "Inspector")}</label>
            <input
              data-testid="input-inspector"
              value={inspector}
              onChange={(e) => setInspector(e.target.value)}
              placeholder={t("Ing. Name, P.E.", "Ing. Nombre, P.E.")}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">{t("Scheduled Date", "Fecha Programada")}</label>
            <input
              data-testid="input-scheduled-date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>
          <button
            onClick={submit}
            disabled={submitting}
            data-testid="btn-submit-inspection"
            className="w-full mt-2 py-2.5 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md disabled:opacity-50"
          >
            {submitting ? t("Scheduling…", "Programando…") : t("Schedule", "Programar")}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditInspectionDialog({
  projectId,
  inspection,
  onClose,
  onSaved,
}: {
  projectId: string;
  inspection: Inspection;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [inspector, setInspector] = useState(inspection.inspector);
  const [scheduledDate, setScheduledDate] = useState(inspection.scheduledDate);
  const [notes, setNotes] = useState(inspection.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await customFetch(`/api/projects/${projectId}/inspections/${inspection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspector, scheduledDate, notes }),
      });
      toast({ title: t("Inspection updated", "Inspección actualizada") });
      onSaved();
      onClose();
    } catch {
      toast({ title: t("Failed to update", "Error al actualizar"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="edit-inspection-modal">
      <div className="bg-card rounded-xl border border-card-border shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">{t("Edit Inspection", "Editar Inspección")}</h2>
          <button onClick={onClose} data-testid="btn-close-edit-inspection"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">{t("Inspector", "Inspector")}</label>
            <input
              data-testid="input-edit-inspector"
              value={inspector}
              onChange={(e) => setInspector(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">{t("Scheduled Date", "Fecha Programada")}</label>
            <input
              data-testid="input-edit-date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">{t("Notes", "Notas")}</label>
            <textarea
              data-testid="input-edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>
          <button
            onClick={submit}
            disabled={submitting}
            data-testid="btn-save-inspection"
            className="w-full mt-2 py-2.5 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md disabled:opacity-50"
          >
            {submitting ? t("Saving…", "Guardando…") : t("Save Changes", "Guardar Cambios")}
          </button>
        </div>
      </div>
    </div>
  );
}

function SendReportDialog({
  projectId,
  inspection,
  engineers,
  onClose,
  onSent,
}: {
  projectId: string;
  inspection: Inspection;
  engineers: StructuralEngineer[];
  onClose: () => void;
  onSent: () => void;
}) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [engineerId, setEngineerId] = useState(engineers[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!engineerId) return;
    setSending(true);
    try {
      await customFetch(`/api/projects/${projectId}/inspections/${inspection.id}/send-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engineerId, note: note.trim() || undefined }),
      });
      toast({
        title: t("Report sent", "Reporte enviado"),
        description: t("Email simulated to engineer.", "Correo simulado al ingeniero."),
      });
      onSent();
      onClose();
    } catch {
      toast({ title: t("Failed to send", "Error al enviar"), variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="send-report-modal">
      <div className="bg-card rounded-xl border border-card-border shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{t("Send Report to Engineer", "Enviar Reporte al Ingeniero")}</h2>
          <button onClick={onClose} data-testid="btn-close-send-report"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {lang === "es" ? inspection.titleEs : inspection.title}
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">{t("Engineer", "Ingeniero")}</label>
            <select
              data-testid="select-engineer"
              value={engineerId}
              onChange={(e) => setEngineerId(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            >
              {engineers.map((eng) => (
                <option key={eng.id} value={eng.id}>{eng.name} — {eng.firm}</option>
              ))}
            </select>
            {engineers.find((e) => e.id === engineerId) && (
              <p className="text-xs text-muted-foreground mt-1.5">
                {lang === "es" ? engineers.find((e) => e.id === engineerId)!.specialtyEs : engineers.find((e) => e.id === engineerId)!.specialty} · {engineers.find((e) => e.id === engineerId)!.email}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">{t("Note (optional)", "Nota (opcional)")}</label>
            <textarea
              data-testid="textarea-report-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={t("Anything specific to flag for the engineer…", "Algo específico para el ingeniero…")}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background resize-none"
            />
          </div>
          <button
            onClick={send}
            disabled={sending || !engineerId}
            data-testid="btn-send-report"
            className="w-full py-2.5 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send className="w-4 h-4" /> {sending ? t("Sending…", "Enviando…") : t("Send Report", "Enviar Reporte")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InspectionsSection({ projectId }: { projectId: string }) {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useGetProjectInspections(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectInspectionsQueryKey(projectId) },
  });
  const isStaff = user?.role === "admin" || user?.role === "architect" || user?.role === "superadmin";
  const { data: engineers = [] } = useListStructuralEngineers({
    query: { enabled: isStaff, queryKey: getListStructuralEngineersQueryKey() },
  });
  const [showCreate, setShowCreate] = useState(false);
  const [reportFor, setReportFor] = useState<Inspection | null>(null);
  const [editFor, setEditFor] = useState<Inspection | null>(null);

  const inspections = data?.inspections ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetProjectInspectionsQueryKey(projectId) });

  return (
    <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="inspections-section">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-konti-olive" />
          {t("Inspections", "Inspecciones")}
          <span className="text-xs text-muted-foreground font-normal">({inspections.length})</span>
        </h2>
        {isStaff && (
          <button
            onClick={() => setShowCreate(true)}
            data-testid="btn-create-inspection"
            className="text-xs flex items-center gap-1 px-2.5 py-1 bg-konti-olive hover:bg-konti-olive/90 text-white font-semibold rounded-md"
          >
            <Plus className="w-3.5 h-3.5" /> {t("Schedule", "Programar")}
          </button>
        )}
      </div>

      {inspections.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          {t("No inspections scheduled yet.", "No hay inspecciones programadas.")}
        </p>
      ) : (
        <div className="space-y-2.5">
          {inspections.map((insp) => {
            const completed = insp.status === "passed" || insp.status === "failed" || insp.status === "re_inspect";
            return (
              <div
                key={insp.id}
                data-testid={`inspection-${insp.id}`}
                className="border border-border rounded-lg p-3 hover:border-konti-olive/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{lang === "es" ? insp.titleEs : insp.title}</p>
                    <div className="flex items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{insp.inspector}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{insp.scheduledDate}</span>
                      {insp.completedDate && (
                        <span className="flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" />{insp.completedDate}
                        </span>
                      )}
                    </div>
                  </div>
                  <StatusPill status={insp.status} />
                </div>
                {(lang === "es" ? insp.notesEs : insp.notes) && (
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded px-2.5 py-1.5 mt-2">
                    {lang === "es" ? insp.notesEs : insp.notes}
                  </p>
                )}
                {insp.reportSentTo && insp.reportSentToName && (
                  <div
                    data-testid={`report-sent-${insp.id}`}
                    className="mt-2 text-xs flex items-center gap-1.5 bg-konti-olive/10 border border-konti-olive/30 text-konti-olive rounded-md px-2.5 py-1.5"
                  >
                    <Send className="w-3 h-3" />
                    {t("Sent on", "Enviado el")} {insp.reportSentAt ? new Date(insp.reportSentAt).toLocaleDateString(lang === "es" ? "es-PR" : "en-US", { month: "short", day: "numeric", year: "numeric" }) : ""} {t("to", "a")} <span className="font-semibold">{insp.reportSentToName}</span>
                  </div>
                )}
                {isStaff && insp.status === "scheduled" && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid={`status-actions-${insp.id}`}>
                    <span className="text-xs text-muted-foreground mr-1">{t("Mark as:", "Marcar como:")}</span>
                    {(["passed", "failed", "re_inspect"] as const).map((s) => (
                      <button
                        key={s}
                        data-testid={`btn-mark-${s}-${insp.id}`}
                        onClick={async () => {
                          try {
                            await customFetch(`/api/projects/${projectId}/inspections/${insp.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: s, completedDate: new Date().toISOString().slice(0, 10) }),
                            });
                            toast({ title: t("Inspection updated", "Inspección actualizada") });
                            refresh();
                          } catch {
                            toast({ title: t("Failed to update", "Falló la actualización"), variant: "destructive" });
                          }
                        }}
                        className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted font-medium"
                      >
                        {s === "passed" ? t("Passed", "Aprobada") : s === "failed" ? t("Failed", "Fallida") : t("Re-inspect", "Re-inspección")}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {completed && insp.reportDocumentUrl && (
                    <a
                      href={insp.reportDocumentUrl}
                      data-testid={`link-inspection-report-${insp.id}`}
                      title={insp.reportDocumentName ?? "Inspection report"}
                      className="text-xs text-konti-olive hover:underline font-medium flex items-center gap-1"
                    >
                      <ClipboardCheck className="w-3 h-3" />
                      {insp.reportDocumentName ?? t("Report", "Reporte")}
                    </a>
                  )}
                  {isStaff && (
                    <button
                      onClick={() => setEditFor(insp)}
                      data-testid={`btn-edit-inspection-${insp.id}`}
                      className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted font-medium"
                    >
                      {t("Edit", "Editar")}
                    </button>
                  )}
                  {isStaff && (
                    <button
                      onClick={async () => {
                        const confirmed = window.confirm(
                          t(
                            `Remove inspection "${insp.title}"? This cannot be undone.`,
                            `¿Eliminar inspección "${insp.titleEs}"? Esta acción no se puede deshacer.`,
                          ),
                        );
                        if (!confirmed) return;
                        try {
                          await customFetch(`/api/projects/${projectId}/inspections/${insp.id}`, {
                            method: "DELETE",
                          });
                          toast({ title: t("Inspection removed", "Inspección eliminada") });
                          refresh();
                        } catch {
                          toast({ title: t("Failed to remove", "Error al eliminar"), variant: "destructive" });
                        }
                      }}
                      data-testid={`btn-remove-inspection-${insp.id}`}
                      className="text-xs px-2 py-0.5 rounded border border-red-200 text-red-700 hover:bg-red-50 font-medium flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> {t("Remove", "Eliminar")}
                    </button>
                  )}
                  {isStaff && completed && !insp.reportSentTo && engineers.length > 0 && (
                    <button
                      onClick={() => setReportFor(insp)}
                      data-testid={`btn-send-report-${insp.id}`}
                      className="text-xs flex items-center gap-1.5 px-2.5 py-1 border border-konti-olive/40 text-konti-olive hover:bg-konti-olive/10 font-semibold rounded-md transition-colors"
                    >
                      <Send className="w-3 h-3" /> {t("Send report to engineer", "Enviar reporte al ingeniero")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateInspectionDialog projectId={projectId} onClose={() => setShowCreate(false)} onCreated={refresh} />
      )}
      {reportFor && (
        <SendReportDialog
          projectId={projectId}
          inspection={reportFor}
          engineers={engineers}
          onClose={() => setReportFor(null)}
          onSent={refresh}
        />
      )}
      {editFor && (
        <EditInspectionDialog
          projectId={projectId}
          inspection={editFor}
          onClose={() => setEditFor(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

export default InspectionsSection;
