import { useState } from "react";
import { useGetProjectAuditLog, getGetProjectAuditLogQueryKey } from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { Activity } from "lucide-react";

const TYPE_LABELS: Record<string, { en: string; es: string }> = {
  client_view:                  { en: "Viewed",          es: "Visto" },
  document_download:            { en: "Downloaded",      es: "Descargado" },
  client_upload:                { en: "Uploaded",        es: "Subido" },
  profile_update:               { en: "Profile updated", es: "Perfil actualizado" },
  document_visibility_change:   { en: "Visibility",      es: "Visibilidad" },
  proposal_decision:            { en: "Proposal",        es: "Propuesta" },
  change_order_decision:        { en: "Change order",    es: "Orden de cambio" },
};

function fmtDate(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(lang === "es" ? "es-PR" : "en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ClientActivityCard({ projectId }: { projectId: string }) {
  const { t, lang } = useLang();
  const [clientOnly, setClientOnly] = useState(true);
  const { data, isLoading } = useGetProjectAuditLog(
    projectId,
    { clientOnly },
    { query: { enabled: !!projectId, queryKey: getGetProjectAuditLogQueryKey(projectId, { clientOnly }) } },
  );
  const entries = (data?.entries ?? []).slice(0, 25);

  return (
    <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="client-activity-card">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="font-bold text-foreground flex items-center gap-1.5">
          <Activity className="w-4 h-4" /> {t("Client Activity", "Actividad del Cliente")}
        </h2>
        <button
          type="button"
          onClick={() => setClientOnly((v) => !v)}
          className="text-[11px] text-konti-olive hover:text-konti-olive/80 font-medium transition-colors"
          data-testid="btn-toggle-audit-filter"
        >
          {clientOnly ? t("Show all", "Mostrar todo") : t("Client only", "Solo cliente")}
        </button>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("Loading…", "Cargando…")}</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="audit-empty">
          {clientOnly
            ? t("No client activity yet.", "Sin actividad del cliente aún.")
            : t("No activity recorded yet.", "Sin actividad registrada aún.")}
        </p>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto pr-1" data-testid="audit-list">
          {entries.map((entry) => {
            const typeLabel = TYPE_LABELS[entry.type];
            const tag = typeLabel ? (lang === "es" ? typeLabel.es : typeLabel.en) : entry.type;
            const desc = lang === "es" ? entry.descriptionEs : entry.description;
            return (
              <li key={entry.id} className="border-b border-border/50 pb-2 last:border-b-0 last:pb-0" data-testid={`audit-row-${entry.id}`}>
                <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide">
                  <span className="text-konti-olive font-bold">{tag}</span>
                  <span className="text-muted-foreground/70">{fmtDate(entry.timestamp, lang)}</span>
                </div>
                <p className="text-xs text-foreground mt-0.5 break-words">{desc}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{entry.actor}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default ClientActivityCard;
