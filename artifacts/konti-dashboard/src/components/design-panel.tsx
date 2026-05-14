import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProjectDesign,
  useUpdateDesignDeliverable,
  useAdvanceDesignSubPhase,
  getGetProjectQueryKey,
  getGetProjectDesignQueryKey,
  type Deliverable,
  type DeliverableStatus,
  type DesignSubPhaseState,
  UpdateDesignDeliverableBodyStatus,
  UpdateDesignDeliverableBodySubPhase,
  DesignStateResponseSubPhaseOrderItem,
} from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2, Circle, ArrowRight, Layers } from "lucide-react";

type DesignSubPhase = DesignStateResponseSubPhaseOrderItem;

const STATUS_CYCLE: Record<DeliverableStatus, UpdateDesignDeliverableBodyStatus> = {
  pending: UpdateDesignDeliverableBodyStatus.in_progress,
  in_progress: UpdateDesignDeliverableBodyStatus.done,
  done: UpdateDesignDeliverableBodyStatus.pending,
};

const SUB_PHASES: DesignSubPhase[] = [
  DesignStateResponseSubPhaseOrderItem.schematic_design,
  DesignStateResponseSubPhaseOrderItem.design_development,
  DesignStateResponseSubPhaseOrderItem.construction_documents,
];

const SUB_PHASE_TO_BODY: Record<DesignSubPhase, UpdateDesignDeliverableBodySubPhase> = {
  schematic_design: UpdateDesignDeliverableBodySubPhase.schematic_design,
  design_development: UpdateDesignDeliverableBodySubPhase.design_development,
  construction_documents: UpdateDesignDeliverableBodySubPhase.construction_documents,
};

const isDesignSubPhase = (value: string): value is DesignSubPhase =>
  (SUB_PHASES as readonly string[]).includes(value);

export function DesignPanel({ projectId, isClientView, currentPhase }: { projectId: string; isClientView: boolean; currentPhase: string }) {
  const queryClient = useQueryClient();
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data, isLoading } = useGetProjectDesign(projectId);
  const updateMutation = useUpdateDesignDeliverable();
  const advanceMutation = useAdvanceDesignSubPhase();
  const busy = updateMutation.isPending || advanceMutation.isPending;

  const isTeamUser = user?.role !== "client";
  const canEdit = isTeamUser && !isClientView;

  const invalidateDesign = () =>
    queryClient.invalidateQueries({ queryKey: getGetProjectDesignQueryKey(projectId) });

  if (isLoading) return <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm h-40 animate-pulse" />;
  if (!data?.state) return null;

  const state = data.state;
  const order: DesignSubPhase[] = data.subPhaseOrder ?? SUB_PHASES;
  const labels = data.subPhaseLabels ?? {};
  // Derive current sub-phase from canonical project phase
  const currentSubPhase: DesignSubPhase | undefined = isDesignSubPhase(currentPhase) ? currentPhase : undefined;
  const pastDesign = ["permits", "construction", "completed"].includes(currentPhase);
  const isComplete = currentSubPhase === undefined;
  const showInDesign = currentSubPhase !== undefined || pastDesign;
  if (!showInDesign) return null;

  const labelFor = (sp: DesignSubPhase): { en: string; es: string } => {
    const entry = labels[sp];
    return { en: entry?.en ?? sp, es: entry?.es ?? sp };
  };

  const subPhaseState = (sp: DesignSubPhase): DesignSubPhaseState | undefined =>
    state.subPhases[sp];

  const cycleStatus = async (subPhase: DesignSubPhase, d: Deliverable) => {
    if (!canEdit || busy) return;
    try {
      await updateMutation.mutateAsync({
        projectId,
        data: {
          subPhase: SUB_PHASE_TO_BODY[subPhase],
          deliverableId: d.id,
          status: STATUS_CYCLE[d.status],
        },
      });
      await invalidateDesign();
    } catch {
      toast({ title: t("Update failed", "No se pudo actualizar"), variant: "destructive" });
    }
  };

  const advance = async () => {
    if (!canEdit || busy || isComplete) return;
    try {
      await advanceMutation.mutateAsync({ projectId });
      toast({ title: t("Sub-phase advanced", "Sub-fase avanzada") });
      await Promise.all([
        invalidateDesign(),
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }),
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast({
        title: t("Cannot advance", "No se puede avanzar"),
        description: /deliverables_incomplete/.test(msg)
          ? t("Mark all deliverables as done first.", "Marca todas las entregas como completadas primero.")
          : undefined,
        variant: "destructive",
      });
    }
  };

  const currentSP = currentSubPhase ? subPhaseState(currentSubPhase) : undefined;
  const allDone = currentSP ? currentSP.deliverables.every((d) => d.status === "done") : false;

  return (
    <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="design-panel">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <Layers className="w-4 h-4 text-konti-olive" />
          {t("Design Phase", "Fase de Diseño")}
        </h2>
        {isComplete && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
            {t("Complete", "Completa")}
          </span>
        )}
      </div>

      {/* Sub-phase stepper */}
      <div className="flex items-center gap-1 mb-5">
        {order.map((sp, i) => {
          const sub = subPhaseState(sp);
          const idx = order.indexOf(sp);
          const currentIdx = currentSubPhase ? order.indexOf(currentSubPhase) : order.length;
          const isStepCurrent = currentSubPhase === sp;
          const isStepDone = isComplete || idx < currentIdx;
          const lbl = labelFor(sp);
          const label = lang === "es" ? lbl.es : lbl.en;
          return (
            <div key={sp} className="flex-1 flex flex-col items-center gap-1.5" data-testid={`design-step-${sp}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                isStepDone ? "bg-konti-olive text-white" :
                isStepCurrent ? "bg-konti-olive/20 border-2 border-konti-olive text-konti-olive" :
                "bg-muted text-muted-foreground"
              }`}>
                {isStepDone ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-[11px] text-center leading-tight ${isStepCurrent ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{label}</span>
              {sub?.completedAt && (
                <span className="text-[10px] text-muted-foreground">
                  {new Date(sub.completedAt).toLocaleDateString(lang === "es" ? "es-PR" : "en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Active sub-phase deliverables */}
      {currentSP && currentSubPhase && (
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground">
              {t("Active Deliverables", "Entregables Activos")} — {(() => { const lbl = labelFor(currentSubPhase); return lang === "es" ? lbl.es : lbl.en; })()}
            </p>
            <span className="text-xs text-muted-foreground">
              {currentSP.deliverables.filter((d) => d.status === "done").length}/{currentSP.deliverables.length} {t("done", "completos")}
            </span>
          </div>
          <div className="space-y-1.5">
            {currentSP.deliverables.map((d) => {
              const label = lang === "es" ? d.labelEs : d.label;
              const statusUI: Record<DeliverableStatus, { icon: React.ReactNode; bg: string; text: string }> = {
                pending: { icon: <Circle className="w-3.5 h-3.5" />, bg: "bg-muted/40", text: "text-muted-foreground" },
                in_progress: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, bg: "bg-amber-50 border border-amber-200", text: "text-amber-800" },
                done: { icon: <Check className="w-3.5 h-3.5" />, bg: "bg-emerald-50 border border-emerald-200", text: "text-emerald-800" },
              };
              const ui = statusUI[d.status];
              return (
                <button
                  key={d.id}
                  onClick={() => cycleStatus(currentSubPhase, d)}
                  disabled={!canEdit || busy}
                  data-testid={`deliverable-${d.id}`}
                  className={`w-full text-left flex items-center gap-3 p-2.5 rounded-lg ${ui.bg} ${canEdit ? "hover:opacity-80 cursor-pointer" : "cursor-default"}`}
                >
                  <span className={ui.text}>{ui.icon}</span>
                  <span className={`flex-1 text-sm font-medium ${d.status === "done" ? "line-through opacity-70" : ""}`}>{label}</span>
                  {d.owner && <span className="text-xs text-muted-foreground hidden sm:inline">{d.owner}</span>}
                </button>
              );
            })}
          </div>

          {canEdit && (
            <button
              onClick={advance}
              disabled={busy || !allDone}
              data-testid="btn-advance-sub-phase"
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-konti-olive hover:bg-konti-olive/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-md transition-colors"
            >
              {t("Advance to Next Sub-Phase", "Avanzar a Siguiente Sub-Fase")} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          {!allDone && canEdit && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {t("Mark all deliverables as done to enable.", "Marca todos los entregables como completos para habilitar.")}
            </p>
          )}
        </div>
      )}

      {isComplete && (
        <div className="border-t border-border pt-4 text-center">
          <p className="text-sm text-emerald-700 font-medium">
            {t("All design sub-phases approved. Ready for permits & construction.", "Todas las sub-fases de diseño aprobadas. Listo para permisos y construcción.")}
          </p>
        </div>
      )}
    </div>
  );
}
