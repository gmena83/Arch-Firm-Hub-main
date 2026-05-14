import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/hooks/use-lang";
import { Loader2, Check, AlertCircle, Wand2 } from "lucide-react";
import {
  CANONICAL_FIELDS,
  type ImportKind,
  type Mapping,
  type ParsedCsv,
  applyMapping,
  autoDetectMapping,
  validateMapping,
} from "./column-mapping";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (mapping: Mapping) => Promise<void> | void;
  kind: ImportKind;
  parsed: ParsedCsv;
  initialMapping?: Mapping | null;
  busy?: boolean;
  testid?: string;
}

export function MappingDialog({ open, onClose, onConfirm, kind, parsed, initialMapping, busy, testid }: Props) {
  const { t, lang } = useLang();
  const fields = CANONICAL_FIELDS[kind];

  const detected = useMemo(() => autoDetectMapping(kind, parsed.headers), [kind, parsed.headers]);
  const [mapping, setMapping] = useState<Mapping>(detected);

  useEffect(() => {
    if (!open) return;
    // Re-seed when the dialog opens so each open recomputes with the latest CSV.
    const seed: Mapping = { ...detected };
    if (initialMapping) {
      // Use saved values only when the column still exists in the new CSV.
      for (const k of Object.keys(initialMapping)) {
        const v = initialMapping[k];
        if (v && parsed.headers.includes(v)) seed[k] = v;
      }
    }
    setMapping(seed);
  }, [open, detected, initialMapping, parsed.headers]);

  if (!open) return null;

  const missing = validateMapping(kind, mapping);
  const canConfirm = missing.length === 0;
  const previewRows = applyMapping(parsed, mapping).slice(0, 5);
  const requiredCount = fields.filter((f) => f.required).length;
  const autoCount = fields.filter((f) => f.required && detected[f.key]).length;

  const setField = (canonicalKey: string, sourceHeader: string) => {
    setMapping((prev) => ({ ...prev, [canonicalKey]: sourceHeader || null }));
  };

  const resetToAuto = () => setMapping({ ...detected });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      data-testid={testid ?? "mapping-dialog"}
    >
      <div className="bg-card rounded-xl border border-card-border shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-base text-foreground">
                {t("Map your columns to the calculator", "Mapea tus columnas al calculador")}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  `Auto-matched ${autoCount} of ${requiredCount} required columns. Review or correct, then confirm. The mapping is remembered for this project.`,
                  `Auto-detectadas ${autoCount} de ${requiredCount} columnas requeridas. Revisa o corrige y confirma. El mapeo se recordará para este proyecto.`,
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={resetToAuto}
              data-testid="mapping-reset-auto"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-border hover:bg-muted shrink-0"
            >
              <Wand2 className="w-3.5 h-3.5" />
              {t("Reset to auto", "Restablecer auto")}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-2" data-testid="mapping-grid">
            {fields.map((f) => {
              const current = mapping[f.key] ?? "";
              const isMissingRequired = f.required && !current;
              return (
                <div
                  key={f.key}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-2 sm:gap-4 items-center bg-muted/20 rounded-md px-3 py-2"
                >
                  <div className="text-xs">
                    <p className="font-semibold text-foreground">
                      {lang === "es" ? f.labelEs : f.labelEn}
                      {f.required && <span className="text-destructive ml-1">*</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t(`Calculator field: ${f.key}`, `Campo del calculador: ${f.key}`)}
                    </p>
                  </div>
                  <select
                    value={current}
                    onChange={(e) => setField(f.key, e.target.value)}
                    data-testid={`mapping-select-${f.key}`}
                    className={`w-full px-2.5 py-1.5 rounded border bg-background text-xs ${isMissingRequired ? "border-destructive" : "border-input"}`}
                  >
                    <option value="">{t("— not in this file —", "— no está en el archivo —")}</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {missing.length > 0 && (
            <div
              className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2"
              data-testid="mapping-missing-warning"
            >
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <p>
                {t(
                  `Required columns still need a source: ${missing.join(", ")}.`,
                  `Faltan columnas requeridas: ${missing.join(", ")}.`,
                )}
              </p>
            </div>
          )}

          <div className="border border-konti-olive/30 bg-konti-olive/5 rounded-md p-3" data-testid="mapping-preview">
            <p className="text-xs font-semibold text-foreground mb-2">
              {t(
                `Preview of the first ${previewRows.length} mapped row(s) of ${parsed.rows.length}`,
                `Vista previa de las primeras ${previewRows.length} filas mapeadas de ${parsed.rows.length}`,
              )}
            </p>
            {previewRows.length === 0 ? (
              <p className="text-[11px] italic text-muted-foreground">{t("No data rows.", "Sin filas de datos.")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] min-w-[420px]">
                  <thead className="bg-muted/60">
                    <tr>
                      {fields.map((f) => (
                        <th key={f.key} className="text-left px-2 py-1 font-semibold whitespace-nowrap">
                          {lang === "es" ? f.labelEs : f.labelEn}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewRows.map((row, i) => (
                      <tr key={i}>
                        {fields.map((f) => (
                          <td key={f.key} className="px-2 py-1 align-top">
                            {row[f.key] ?? <span className="text-muted-foreground italic">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-border flex items-center justify-end gap-2 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            data-testid="mapping-cancel"
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-border text-xs font-semibold rounded-md hover:bg-muted disabled:opacity-50"
          >
            {t("Cancel", "Cancelar")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(mapping)}
            disabled={busy || !canConfirm}
            data-testid="mapping-confirm"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-konti-olive hover:bg-konti-olive/90 text-white text-xs font-semibold rounded-md disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {t("Confirm Import", "Confirmar Importación")}
          </button>
        </div>
      </div>
    </div>
  );
}
