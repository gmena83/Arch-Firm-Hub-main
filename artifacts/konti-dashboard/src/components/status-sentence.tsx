import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateProjectStatusNote,
  useGetProjectInspections,
  getGetProjectQueryKey,
  getGetProjectInspectionsQueryKey,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Pencil, Loader2, X } from "lucide-react";

interface StatusSentenceProps {
  projectId: string;
  currentStatusNote?: string;
  currentStatusNoteEs?: string;
  phaseLabel: string;
  phaseLabelEs: string;
  progressPercent: number;
  className?: string;
  /**
   * When true, an inline pencil button appears that lets a team user edit
   * both the EN and ES sentences. The edit affordance is hidden whenever
   * `canEdit` is false (clients, or team members in client-preview mode).
   */
  canEdit?: boolean;
}

function buildFallback(
  lang: "en" | "es",
  phaseLabel: string,
  phaseLabelEs: string,
  progressPercent: number,
  nextInspectionTitle: string | null,
  nextInspectionTitleEs: string | null,
  nextInspectionDate: string | null,
): string {
  const phase = lang === "es" ? phaseLabelEs : phaseLabel;
  const nextTitle = lang === "es" ? nextInspectionTitleEs : nextInspectionTitle;

  if (lang === "es") {
    const phasePart = `Estamos en la fase de ${phase} (${progressPercent}% completado).`;
    const inspPart = nextTitle && nextInspectionDate
      ? ` Próxima inspección: ${nextTitle} programada para el ${nextInspectionDate}.`
      : nextTitle
        ? ` Próxima inspección: ${nextTitle}.`
        : "";
    return phasePart + inspPart;
  }
  const phasePart = `We're in the ${phase} phase (${progressPercent}% complete).`;
  const inspPart = nextTitle && nextInspectionDate
    ? ` Next inspection: ${nextTitle} scheduled for ${nextInspectionDate}.`
    : nextTitle
      ? ` Next inspection: ${nextTitle}.`
      : "";
  return phasePart + inspPart;
}

export function StatusSentence({
  projectId,
  currentStatusNote,
  currentStatusNoteEs,
  phaseLabel,
  phaseLabelEs,
  progressPercent,
  className,
  canEdit = false,
}: StatusSentenceProps) {
  const { t, lang } = useLang();
  const { user, viewRole } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // The pencil only renders for non-client users in team view.
  const editAllowed = canEdit && user?.role !== "client" && viewRole === "team";

  const { data: inspectionsData } = useGetProjectInspections(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectInspectionsQueryKey(projectId) },
  });
  const upcomingInspection = (inspectionsData?.inspections ?? [])
    .filter((i) => i.status === "scheduled")
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0];

  const noteEn = (currentStatusNote ?? "").trim();
  const noteEs = (currentStatusNoteEs ?? "").trim();

  // Prefer the active language; fall back to the other language; then to the
  // deterministic phase + percent + next-inspection fallback.
  const active = lang === "es" ? noteEs : noteEn;
  const other = lang === "es" ? noteEn : noteEs;
  const sentence = active
    || other
    || buildFallback(
      lang,
      phaseLabel,
      phaseLabelEs,
      progressPercent,
      upcomingInspection?.title ?? null,
      upcomingInspection?.titleEs ?? null,
      upcomingInspection?.scheduledDate ?? null,
    );
  const isFallback = !active && !other;

  const [editing, setEditing] = useState(false);
  const [draftEn, setDraftEn] = useState(noteEn);
  const [draftEs, setDraftEs] = useState(noteEs);

  useEffect(() => { if (!editing) setDraftEn(noteEn); }, [noteEn, editing]);
  useEffect(() => { if (!editing) setDraftEs(noteEs); }, [noteEs, editing]);

  const mutation = useUpdateProjectStatusNote({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        await queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        toast({
          title: t("Saved", "Guardado"),
          description: t("Status note updated.", "Nota de estado actualizada."),
        });
        setEditing(false);
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: t("Save failed", "Error al guardar"),
          description: t("Could not update the status note.", "No se pudo actualizar la nota de estado."),
        });
      },
    },
  });

  const onSave = () => {
    mutation.mutate({
      projectId,
      data: {
        currentStatusNote: draftEn.trim(),
        currentStatusNoteEs: draftEs.trim(),
      },
    });
  };

  const onCancel = () => {
    setDraftEn(noteEn);
    setDraftEs(noteEs);
    setEditing(false);
  };

  if (editing) {
    return (
      <div
        data-testid="status-sentence-editor"
        className={`rounded-lg border border-konti-olive/30 bg-konti-olive/5 p-4 space-y-3 ${className ?? ""}`}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-konti-olive uppercase tracking-wide flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            {t("What's happening now", "Qué está pasando ahora")}
          </p>
          <button
            onClick={onCancel}
            data-testid="status-sentence-cancel"
            className="p-1 rounded hover:bg-muted/40 text-muted-foreground"
            aria-label={t("Cancel", "Cancelar")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              {t("English", "Inglés")}
            </span>
            <textarea
              value={draftEn}
              onChange={(e) => setDraftEn(e.target.value)}
              data-testid="status-sentence-input-en"
              rows={3}
              maxLength={500}
              placeholder={t(
                "Tell the client in plain language what the team is doing right now.",
                "Cuéntale al cliente en lenguaje sencillo qué está haciendo el equipo ahora mismo.",
              )}
              className="mt-1 w-full rounded-md border border-card-border bg-card p-2 text-sm focus:outline-none focus:ring-1 focus:ring-konti-olive"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              {t("Spanish", "Español")}
            </span>
            <textarea
              value={draftEs}
              onChange={(e) => setDraftEs(e.target.value)}
              data-testid="status-sentence-input-es"
              rows={3}
              maxLength={500}
              placeholder={t(
                "Cuéntale al cliente en lenguaje sencillo qué está haciendo el equipo ahora mismo.",
                "Cuéntale al cliente en lenguaje sencillo qué está haciendo el equipo ahora mismo.",
              )}
              className="mt-1 w-full rounded-md border border-card-border bg-card p-2 text-sm focus:outline-none focus:ring-1 focus:ring-konti-olive"
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            data-testid="status-sentence-cancel-btn"
            className="px-3 py-1.5 rounded-md text-xs font-semibold text-muted-foreground hover:bg-muted/40"
          >
            {t("Cancel", "Cancelar")}
          </button>
          <button
            onClick={onSave}
            disabled={mutation.isPending}
            data-testid="status-sentence-save"
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-konti-olive text-white hover:bg-konti-olive/90 disabled:opacity-60 flex items-center gap-1.5"
          >
            {mutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            {t("Save", "Guardar")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="status-sentence"
      data-fallback={isFallback ? "true" : "false"}
      className={`rounded-lg border border-konti-olive/20 bg-konti-olive/5 p-4 ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-konti-olive uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            {t("What's happening now", "Qué está pasando ahora")}
          </p>
          <p
            data-testid="status-sentence-text"
            className="text-sm text-foreground leading-relaxed"
          >
            {sentence}
          </p>
          {isFallback && editAllowed && (
            <p className="mt-1.5 text-xs text-muted-foreground italic">
              {t(
                "No team note yet — clients see this auto-generated summary.",
                "Aún no hay nota del equipo — los clientes ven este resumen automático.",
              )}
            </p>
          )}
        </div>
        {editAllowed && (
          <button
            onClick={() => setEditing(true)}
            data-testid="status-sentence-edit"
            aria-label={t("Edit status note", "Editar nota de estado")}
            className="shrink-0 p-1.5 rounded-md text-konti-olive hover:bg-konti-olive/10"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default StatusSentence;
