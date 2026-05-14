import {
  useGetProjectMilestones,
  getGetProjectMilestonesQueryKey,
  type Milestone,
} from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { Check, Clock, Circle } from "lucide-react";

function statusStyle(status: string) {
  if (status === "completed") return { bar: "bg-konti-olive", dot: "bg-konti-olive border-konti-olive text-white", icon: <Check className="w-3 h-3" /> };
  if (status === "in_progress") return { bar: "bg-amber-500", dot: "bg-amber-500 border-amber-500 text-white", icon: <Clock className="w-3 h-3" /> };
  return { bar: "bg-slate-200", dot: "bg-card border-slate-300 text-slate-400", icon: <Circle className="w-3 h-3" /> };
}

export function MilestonesTimeline({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const { t, lang } = useLang();
  const { data } = useGetProjectMilestones(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectMilestonesQueryKey(projectId) },
  });

  const milestones: Milestone[] = data?.milestones ?? [];
  if (milestones.length === 0) return null;

  if (compact) {
    return (
      <div className="space-y-2" data-testid="milestones-timeline-compact">
        <div className="flex items-center gap-1.5">
          {milestones.map((m) => {
            const s = statusStyle(m.status);
            return (
              <div
                key={m.id}
                title={lang === "es" ? m.titleEs : m.title}
                data-testid={`milestone-compact-${m.key}`}
                className={`flex-1 h-1.5 rounded-full ${s.bar}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
          <span>{milestones[0]?.startDate}</span>
          <span>{milestones[milestones.length - 1]?.endDate}</span>
        </div>
      </div>
    );
  }

  // Compute Gantt range
  const allStarts = milestones.map((m) => new Date(m.startDate).getTime());
  const allEnds = milestones.map((m) => new Date(m.endDate).getTime());
  const minTs = Math.min(...allStarts);
  const maxTs = Math.max(...allEnds);
  const span = Math.max(1, maxTs - minTs);

  function pct(ts: number) {
    return ((ts - minTs) / span) * 100;
  }

  return (
    <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="milestones-timeline">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <h2 className="font-bold text-foreground">{t("Construction Milestones", "Hitos de Construcción")}</h2>
        <div className="flex items-center gap-x-3 gap-y-1 text-xs flex-wrap">
          <span className="flex items-center gap-1 text-konti-olive"><span className="w-2 h-2 rounded-full bg-konti-olive" />{t("Done", "Listo")}</span>
          <span className="flex items-center gap-1 text-amber-600"><span className="w-2 h-2 rounded-full bg-amber-500" />{t("In Progress", "En Progreso")}</span>
          <span className="flex items-center gap-1 text-slate-500"><span className="w-2 h-2 rounded-full border border-slate-300" />{t("Upcoming", "Próximo")}</span>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground mb-2">{t("Click a milestone to jump to its tasks", "Haz clic en un hito para ir a sus tareas")}</p>

      <div className="space-y-2.5">
        {milestones.map((m) => {
          const s = statusStyle(m.status);
          const startTs = new Date(m.startDate).getTime();
          const endTs = new Date(m.endDate).getTime();
          const left = pct(startTs);
          const width = Math.max(2, pct(endTs) - left);
          return (
            <a
              key={m.id}
              href="#tasks"
              data-testid={`milestone-${m.key}`}
              className="flex items-center gap-3 hover:bg-muted/40 rounded-md p-1.5 -mx-1.5 transition-colors cursor-pointer"
            >
              <div className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${s.dot}`}>
                {s.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-0.5 sm:gap-2 mb-1">
                  <p className="text-sm font-semibold text-foreground truncate">{lang === "es" ? m.titleEs : m.title}</p>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{m.startDate} → {m.endDate}</span>
                </div>
                <div className="relative h-2 rounded-full bg-slate-100 overflow-visible" data-testid={`gantt-track-${m.key}`}>
                  <div
                    className={`absolute top-0 h-full rounded-full ${s.bar} ${m.status === "in_progress" ? "opacity-90" : ""}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    data-testid={`gantt-bar-${m.key}`}
                  />
                </div>
              </div>
            </a>
          );
        })}
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground mt-3 pl-9">
        <span>{new Date(minTs).toISOString().slice(0, 10)}</span>
        <span>{new Date(maxTs).toISOString().slice(0, 10)}</span>
      </div>
    </div>
  );
}

export default MilestonesTimeline;
