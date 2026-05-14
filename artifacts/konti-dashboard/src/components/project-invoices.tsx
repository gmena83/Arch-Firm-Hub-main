import { useGetProjectInvoices, getGetProjectInvoicesQueryKey } from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { Receipt } from "lucide-react";

const STATUS_BADGE: Record<string, { en: string; es: string; cls: string }> = {
  draft:   { en: "Draft",       es: "Borrador",        cls: "bg-muted text-muted-foreground border-border" },
  sent:    { en: "Sent",        es: "Enviada",         cls: "bg-blue-100 text-blue-700 border-blue-200" },
  partial: { en: "Partial",     es: "Parcial",         cls: "bg-amber-100 text-amber-800 border-amber-200" },
  paid:    { en: "Paid",        es: "Pagada",          cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  overdue: { en: "Overdue",     es: "Vencida",         cls: "bg-rose-100 text-rose-700 border-rose-200" },
};

export function ProjectInvoices({ projectId }: { projectId: string }) {
  const { t, lang } = useLang();
  const { data } = useGetProjectInvoices(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectInvoicesQueryKey(projectId) },
  });

  const invoices = data?.invoices ?? [];
  if (invoices.length === 0) return null;

  const fmt = (n: number) => `$${n.toLocaleString()}`;

  return (
    <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="invoices-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <Receipt className="w-4 h-4 text-konti-olive" />
          {t("Invoices", "Facturas")}
        </h2>
        <span className="text-xs text-muted-foreground">{invoices.length}</span>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border">
              <th className="text-left font-semibold py-1.5 pr-2">{t("Invoice", "Factura")}</th>
              <th className="text-right font-semibold py-1.5 px-2">{t("Total", "Total")}</th>
              <th className="text-right font-semibold py-1.5 px-2">{t("Paid", "Pagado")}</th>
              <th className="text-right font-semibold py-1.5 px-2">{t("Balance", "Saldo")}</th>
              <th className="text-right font-semibold py-1.5 pl-2">{t("Status", "Estado")}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const meta = STATUS_BADGE[inv.status] ?? STATUS_BADGE["draft"]!;
              return (
                <tr
                  key={inv.id}
                  data-testid={`invoice-row-${inv.id}`}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="py-2 pr-2">
                    <div className="font-semibold text-foreground">{inv.number}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight">
                      {lang === "es" ? inv.titleEs : inv.title}
                    </div>
                    <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                      {t("Issued", "Emitida")}: {inv.issuedAt} · {t("Due", "Vence")}: {inv.dueAt}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right font-medium text-foreground whitespace-nowrap">{fmt(inv.total)}</td>
                  <td className="py-2 px-2 text-right text-muted-foreground whitespace-nowrap">{fmt(inv.paid)}</td>
                  <td className="py-2 px-2 text-right font-semibold text-foreground whitespace-nowrap">{fmt(inv.balance)}</td>
                  <td className="py-2 pl-2 text-right">
                    <span
                      className={`inline-block text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${meta.cls}`}
                    >
                      {lang === "es" ? meta.es : meta.en}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProjectInvoices;
