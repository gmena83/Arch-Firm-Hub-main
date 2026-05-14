import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { Layers, Check, Loader2, Circle, ArrowRight, ExternalLink } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";

type DesignSubPhase = "schematic_design" | "design_development" | "construction_documents";
type DeliverableStatus = "pending" | "in_progress" | "done";

interface Deliverable {
  id: string;
  label: string;
  labelEs: string;
  owner: string;
  status: DeliverableStatus;
  completedAt?: string;
}
interface SubPhaseState { startedAt?: string; completedAt?: string; deliverables: Deliverable[] }
interface DesignState {
  projectId: string;
  currentSubPhase: DesignSubPhase | "complete";
  subPhases: Record<DesignSubPhase, SubPhaseState>;
}
interface DesignResponse {
  projectId: string;
  available: boolean;
  isProjectInDesign: boolean;
  state: DesignState | null;
  subPhaseOrder: DesignSubPhase[];
  subPhaseLabels: Record<DesignSubPhase, { en: string; es: string }>;
}

const STATUS_ICON: Record<DeliverableStatus, React.ReactNode> = {
  pending: <Circle className="w-3.5 h-3.5 text-slate-400" />,
  in_progress: <Loader2 className="w-3.5 h-3.5 text-amber-600" />,
  done: <Check className="w-3.5 h-3.5 text-emerald-700" />,
};

const STATUS_CHIP: Record<DeliverableStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
};

export function PermitsDesignSection({ projectId }: { projectId: string }) {
  const { t, lang } = useLang();
  const [data, setData] = useState<DesignResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const d = await customFetch<DesignResponse>(`/api/projects/${projectId}/design`);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { setLoading(true); void refresh(); }, [refresh]);

  if (loading) {
    return <div className="bg-white rounded-xl border border-slate-200 p-6 h-40 animate-pulse" data-testid="permits-design-section-loading" />;
  }
  if (!data?.state) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6" data-testid="permits-design-section-empty">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-5 h-5 text-konti-olive" />
          <h2 className="text-lg font-semibold text-slate-900">{t("Design", "Diseño")}</h2>
        </div>
        <p className="text-sm text-slate-500">
          {t("No design data available for this project yet.", "No hay datos de diseño disponibles para este proyecto.")}
        </p>
      </div>
    );
  }

  const labelOf = (s: DesignSubPhase) => lang === "es" ? data.subPhaseLabels[s].es : data.subPhaseLabels[s].en;
  const order = data.subPhaseOrder;
  const current = data.state.currentSubPhase;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm" data-testid="permits-design-section">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-konti-olive" />
          <h2 className="text-lg font-semibold text-slate-900">{t("Design", "Diseño")}</h2>
          <span className="text-xs text-slate-500 ml-2">
            {t("Design-stage deliverables tied to this project's permits flow.",
               "Entregables de la etapa de diseño vinculados al flujo de permisos.")}
          </span>
        </div>
        <Link
          href={`/projects/${projectId}#design`}
          data-testid="link-open-design-page"
          className="inline-flex items-center gap-1 text-sm text-konti-olive hover:text-konti-olive/80 font-medium"
        >
          {t("Open project design", "Abrir diseño del proyecto")} <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <div className="px-5 py-4 space-y-5">
        {order.map((sub) => {
          const sp = data.state!.subPhases[sub];
          const isCurrent = current === sub;
          const isComplete = current === "complete" || (order.indexOf(current as DesignSubPhase) > order.indexOf(sub));
          const total = sp.deliverables.length;
          const done = sp.deliverables.filter((d) => d.status === "done").length;
          return (
            <div key={sub} data-testid={`design-subphase-${sub}`} className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-900">{labelOf(sub)}</span>
                  {isCurrent && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-konti-olive text-white">
                      {t("Current", "Actual")}
                    </span>
                  )}
                  {isComplete && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-600 text-white inline-flex items-center gap-1">
                      <Check className="w-3 h-3" /> {t("Complete", "Completo")}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500 tabular-nums">
                  {done} / {total} {t("done", "listos")}
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {sp.deliverables.map((d) => (
                  <li key={d.id} data-testid={`design-deliverable-${d.id}`} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="shrink-0">{STATUS_ICON[d.status]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 leading-tight">{lang === "es" ? d.labelEs : d.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{d.owner}</p>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${STATUS_CHIP[d.status]}`}>
                      {d.status === "in_progress" ? t("In progress", "En progreso") : d.status === "done" ? t("Done", "Listo") : t("Pending", "Pendiente")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
          <ArrowRight className="w-3 h-3" />
          {t("Design deliverables become inputs to the OGPE submission packet.",
             "Los entregables de diseño alimentan el paquete de sometimiento OGPE.")}
        </div>
      </div>
    </div>
  );
}
