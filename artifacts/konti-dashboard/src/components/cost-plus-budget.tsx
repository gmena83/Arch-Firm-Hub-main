import { useState } from "react";
import { useGetProjectCostPlus, getGetProjectCostPlusQueryKey } from "@workspace/api-client-react";
import { useLang } from "@/hooks/use-lang";
import { Sparkles, Receipt } from "lucide-react";

export function CostPlusBudget({ projectId, isClientView = false }: { projectId: string; isClientView?: boolean }) {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<"budget" | "nonBillable">("budget");
  const { data: cp } = useGetProjectCostPlus(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectCostPlusQueryKey(projectId) },
  });

  if (!cp) return null;

  const fmt = (n: number) => `$${n.toLocaleString()}`;
  const lines = [
    { label: t("Materials", "Materiales"), value: cp.materialsCost },
    { label: t("Labor", "Mano de Obra"), value: cp.laborCost },
    { label: t("Subcontractors", "Subcontratistas"), value: cp.subcontractorCost },
  ];

  const nonBillable = cp.nonBillableExpenses ?? [];
  const nonBillableTotal = cp.nonBillableTotal ?? 0;
  const showNonBillableTab = nonBillable.length > 0;

  return (
    <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="cost-plus-budget">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-foreground">{t("Cost-Plus Budget", "Presupuesto Cost-Plus")}</h2>
        <span className="text-xs px-2 py-0.5 rounded-full bg-konti-olive/15 text-konti-olive border border-konti-olive/30 font-semibold">
          {t("Cost-Plus", "Cost-Plus")}
        </span>
      </div>

      {showNonBillableTab && (
        <div className="flex gap-1 mb-3 border-b border-border overflow-x-auto whitespace-nowrap -mx-1 px-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "budget"}
            onClick={() => setTab("budget")}
            data-testid="tab-cost-plus-budget"
            className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              tab === "budget"
                ? "border-konti-olive text-konti-olive"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("Budget", "Presupuesto")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "nonBillable"}
            onClick={() => setTab("nonBillable")}
            data-testid="tab-cost-plus-non-billable"
            className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors flex items-center gap-1 ${
              tab === "nonBillable"
                ? "border-konti-olive text-konti-olive"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Receipt className="w-3 h-3" />
            {t("Non-Billable Expenses", "Gastos no facturables")}
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {nonBillable.length}
            </span>
          </button>
        </div>
      )}

      {tab === "budget" && (
        isClientView ? (
          <div className="space-y-2 text-sm">
            {lines.map((l) => (
              <div key={l.label} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{l.label}</span>
                <span className="font-medium text-foreground">{fmt(l.value)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1.5 mt-1.5">
              <span className="text-muted-foreground font-medium">{t("Direct Costs Subtotal", "Subtotal Costos Directos")}</span>
              <span className="font-semibold text-foreground">{fmt(cp.subtotal)}</span>
            </div>
            <div className="flex justify-between bg-konti-olive/10 border border-konti-olive/30 rounded-md px-3 py-2 my-2">
              <span className="font-semibold text-konti-olive flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                {t("Plus Management Fee", "Cargo de Administración Plus")} ({cp.plusFeePercent}%)
              </span>
              <span className="font-bold text-konti-olive">{fmt(cp.plusFeeAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 mt-1">
              <span className="font-bold text-foreground">{t("Final Total", "Total Final")}</span>
              <span className="font-bold text-foreground text-lg">{fmt(cp.finalTotal)}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 text-sm">
            {lines.map((l) => (
              <div key={l.label} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{l.label}</span>
                <span className="font-medium text-foreground">{fmt(l.value)}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs border-t border-border pt-1.5 mt-1.5">
              <span className="text-muted-foreground font-medium">{t("Subtotal", "Subtotal")}</span>
              <span className="font-semibold text-foreground">{fmt(cp.subtotal)}</span>
            </div>
            <div
              data-testid="plus-fee-row"
              className="flex justify-between bg-konti-olive/10 border border-konti-olive/30 rounded-md px-2.5 py-1.5 my-1.5 text-xs"
            >
              <span className="font-semibold text-konti-olive flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {t("Plus Fee", "Cargo Plus")} ({cp.plusFeePercent}%)
              </span>
              <span className="font-bold text-konti-olive">{fmt(cp.plusFeeAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 mt-1.5">
              <span className="font-bold text-foreground text-sm">{t("Final Total", "Total Final")}</span>
              <span className="font-bold text-foreground text-base">{fmt(cp.finalTotal)}</span>
            </div>
            {(lang === "es" ? cp.notesEs : cp.notes) && (
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{lang === "es" ? cp.notesEs : cp.notes}</p>
            )}
          </div>
        )
      )}

      {tab === "nonBillable" && (
        <div className="space-y-2" data-testid="non-billable-panel">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t(
              "Project-related expenses paid by the client directly that are not invoiced through Cost-Plus.",
              "Gastos relacionados al proyecto pagados directamente por el cliente que no se facturan dentro del Cost-Plus.",
            )}
          </p>
          <div className="divide-y divide-border border border-border rounded-md overflow-hidden">
            {nonBillable.map((exp) => (
              <div
                key={exp.id}
                data-testid={`non-billable-row-${exp.id}`}
                className="flex items-start justify-between px-3 py-2 text-xs gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {lang === "es" ? exp.categoryEs : exp.category}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{exp.date}</span>
                  </div>
                  <p className="text-foreground mt-0.5 leading-snug">
                    {lang === "es" ? exp.descriptionEs : exp.description}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t("Paid by", "Pagado por")}: {exp.paidBy}
                  </p>
                </div>
                <span className="font-semibold text-foreground whitespace-nowrap">{fmt(exp.amount)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between border-t border-border pt-2 mt-2">
            <span className="font-bold text-foreground text-sm">
              {t("Non-Billable Total", "Total no facturable")}
            </span>
            <span className="font-bold text-foreground text-base" data-testid="non-billable-total">
              {fmt(nonBillableTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default CostPlusBudget;
