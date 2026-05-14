import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProjectProposals,
  useApproveProposal,
  getGetProjectQueryKey,
  getGetProjectProposalsQueryKey,
  type Proposal,
} from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Clock, FileSignature } from "lucide-react";

const SCENARIO_BADGE: Record<Proposal["scenario"], string> = {
  economy: "bg-slate-100 text-slate-800 border-slate-200",
  standard: "bg-konti-olive/15 text-konti-olive border-konti-olive/30",
  premium: "bg-amber-100 text-amber-800 border-amber-200",
};

export function ProposalsPanel({ projectId, isClientView, currentPhase }: { projectId: string; isClientView: boolean; currentPhase: string }) {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetProjectProposals(projectId);
  const approveMutation = useApproveProposal();
  const proposals: Proposal[] = data?.proposals ?? [];

  if (isLoading) return null;
  if (proposals.length === 0) return null;

  // Comparison view: visible only while still negotiating (≤ schematic_design).
  // After approval, show summary if the panel was previously rendered (approved exists).
  const negotiationPhases = ["pre_design", "schematic_design"];
  const hasApprovedAlready = proposals.some((p) => p.status === "approved");
  const showAfterApproval = ["design_development", "construction_documents", "permits", "construction", "completed"].includes(currentPhase) && hasApprovedAlready;
  if (!negotiationPhases.includes(currentPhase) && !showAfterApproval) return null;

  const isClient = user?.role === "client" && isClientView;
  const hasApproved = proposals.some((p) => p.status === "approved");

  const approve = async (proposalId: string) => {
    if (!isClient || approveMutation.isPending) return;
    try {
      const res = (await approveMutation.mutateAsync({ projectId, proposalId })) as { emailWarning?: string };
      toast({ title: t("Proposal approved", "Propuesta aprobada"), description: t("Contract draft is on its way. Project advanced to Permits.", "El borrador del contrato está en camino. Proyecto avanzado a Permisos.") });
      if (res?.emailWarning) {
        toast({
          title: t("Confirmation email could not be sent", "No se pudo enviar el correo de confirmación"),
          description: res.emailWarning,
          variant: "destructive",
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetProjectProposalsQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }),
      ]);
    } catch {
      toast({ title: t("Could not approve", "No se pudo aprobar"), variant: "destructive" });
    }
  };

  return (
    <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="proposals-panel">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <FileSignature className="w-4 h-4 text-konti-olive" />
          {t("Project Proposals", "Propuestas de Proyecto")}
        </h2>
        {hasApproved && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
            {t("Approved", "Aprobada")}
          </span>
        )}
      </div>

      {!hasApproved && isClient && (
        <p className="text-xs bg-konti-olive/10 border border-konti-olive/30 text-konti-olive rounded-md px-3 py-2 mb-4 font-medium">
          {t("Choose the scenario that best fits your goals to lock in the contract.", "Elige el escenario que mejor se ajuste para fijar el contrato.")}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {proposals.map((p) => {
          const title = lang === "es" ? (p.titleEs ?? p.title) : p.title;
          const summary = lang === "es" ? (p.summaryEs ?? p.summary ?? "") : (p.summary ?? "");
          const highlights = (lang === "es" ? p.highlightsEs : p.highlights) ?? [];
          const isApproved = p.status === "approved";
          const isRejected = p.status === "rejected";
          const canApprove = isClient && !hasApproved && p.status === "pending";

          return (
            <div
              key={p.id}
              data-testid={`proposal-${p.scenario}`}
              className={`rounded-xl border-2 p-4 flex flex-col ${
                isApproved ? "border-emerald-400 bg-emerald-50/40" :
                isRejected ? "border-border bg-muted/30 opacity-60" :
                "border-border hover:border-konti-olive/40 transition-colors"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${SCENARIO_BADGE[p.scenario]}`}>
                  {p.scenario}
                </span>
                {isApproved && <CheckCircle className="w-4 h-4 text-emerald-600" />}
                {isRejected && <XCircle className="w-4 h-4 text-muted-foreground" />}
                {p.status === "pending" && <Clock className="w-4 h-4 text-muted-foreground" />}
              </div>
              <h3 className="font-bold text-sm text-foreground mb-1.5 leading-tight">{title}</h3>
              <p className="text-xs text-muted-foreground mb-3">{summary}</p>
              <div className="space-y-1 mb-3">
                {highlights.map((h, i) => (
                  <div key={i} className="text-xs text-foreground flex items-start gap-1.5">
                    <span className="text-konti-olive mt-0.5">•</span>
                    <span>{h}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-2 mt-auto">
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-bold text-foreground">${p.totalCost.toLocaleString()}</span>
                  {p.durationWeeks !== undefined && (
                    <span className="text-xs text-muted-foreground">{p.durationWeeks} {t("wks", "sem")}</span>
                  )}
                </div>
                {p.decidedAt && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {isApproved ? t("Approved", "Aprobada") : t("Not selected", "No seleccionada")} · {p.decidedBy} · {new Date(p.decidedAt).toLocaleDateString(lang === "es" ? "es-PR" : "en-US", { month: "short", day: "numeric" })}
                  </p>
                )}
                {canApprove && (
                  <button
                    onClick={() => approve(p.id)}
                    disabled={approveMutation.isPending}
                    data-testid={`btn-approve-proposal-${p.scenario}`}
                    className="mt-3 w-full py-2 bg-konti-olive hover:bg-konti-olive/90 disabled:opacity-50 text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    {t("Approve This Scenario", "Aprobar Este Escenario")}
                  </button>
                )}
                {!isClient && p.status === "pending" && (
                  <p className="text-[11px] text-muted-foreground mt-2 italic">
                    {t("Awaiting client decision.", "Esperando decisión del cliente.")}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
