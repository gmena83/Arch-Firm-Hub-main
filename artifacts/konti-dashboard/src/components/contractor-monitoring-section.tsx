import { useGetProjectContractorMonitoring, getGetProjectContractorMonitoringQueryKey } from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { AlertTriangle, CircleAlert, CheckCircle2 } from "lucide-react";

interface Props {
  projectId: string;
  variant?: "report" | "card";
}

const STATUS_STYLES: Record<string, { bg: string; text: string; Icon: typeof CheckCircle2; labelEn: string; labelEs: string }> = {
  ok:    { bg: "bg-emerald-900/30 border-emerald-500/30",  text: "text-emerald-400", Icon: CheckCircle2, labelEn: "On track",  labelEs: "En orden" },
  watch: { bg: "bg-amber-900/30 border-amber-500/30",      text: "text-amber-400",   Icon: CircleAlert,  labelEn: "Watch",     labelEs: "Monitorear" },
  issue: { bg: "bg-red-900/30 border-red-500/30",          text: "text-red-400",     Icon: AlertTriangle, labelEn: "Action",   labelEs: "Atención" },
};

export function ContractorMonitoringSection({ projectId, variant = "report" }: Props) {
  const { t, lang } = useLang();
  const { data, isLoading } = useGetProjectContractorMonitoring(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectContractorMonitoringQueryKey(projectId) },
  });
  const rows = data?.rows ?? [];
  if (isLoading || rows.length === 0) return null;

  const isCard = variant === "card";

  return (
    <section data-testid="contractor-monitoring-section">
      <h2 className={isCard
        ? "text-konti-dark text-xs font-semibold uppercase tracking-widest mb-3"
        : "text-[color:var(--rep-fg-faint)] text-xs font-semibold uppercase tracking-widest mb-4"
      }>
        {t("Contractor Monitoring", "Monitoreo del Contratista")}
      </h2>
      <div className={isCard
        ? "rounded-lg border border-konti-olive/20 bg-white divide-y divide-konti-olive/10"
        : "bg-[color:var(--rep-surface)] rounded-xl border border-[color:var(--rep-border)] divide-y divide-[color:var(--rep-border)]"
      }>
        {rows.map((row) => {
          const style = STATUS_STYLES[row.status] ?? STATUS_STYLES["ok"]!;
          const label = lang === "es" ? row.labelEs : row.labelEn;
          const summary = lang === "es" ? row.summaryEs : row.summaryEn;
          const statusLabel = lang === "es" ? style.labelEs : style.labelEn;
          return (
            <div key={row.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3" data-testid={`monitoring-row-${row.type}`}>
              <div className="min-w-0">
                <p className={isCard ? "text-konti-dark font-semibold text-sm" : "text-[color:var(--rep-fg-strong)] font-semibold text-sm"}>{label}</p>
                <p className={isCard ? "text-konti-dark/70 text-xs mt-0.5 break-words" : "text-[color:var(--rep-fg-muted)] text-xs mt-0.5 break-words"}>{summary}</p>
                <p className={isCard ? "text-konti-dark/40 text-[10px] mt-1" : "text-[color:var(--rep-fg-faint)] text-[10px] mt-1"}>{row.updatedAt}</p>
              </div>
              <span className={`self-start shrink-0 px-2 py-1 rounded-md border text-[10px] font-bold whitespace-nowrap inline-flex items-center gap-1 ${style.bg} ${style.text}`}>
                <style.Icon className="w-3 h-3" /> {statusLabel}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default ContractorMonitoringSection;
