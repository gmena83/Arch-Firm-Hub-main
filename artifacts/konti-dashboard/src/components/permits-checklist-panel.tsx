// P6.1 UI — Permits Checklist panel.
//
// Renders the per-project permit checklists (PCOC / PUS / DEA / REA) plus
// a General Information form. Mirrors the structure of file `1a)` Permits
// Checklist Template per the meeting taxonomy (Appendix A.6).
//
// Each checklist row has three boolean toggles (docFilledOut / sent /
// received) and an optional fileUploadLink. Changes save inline on toggle.

import { useEffect, useState, useCallback } from "react";
import { useLang } from "@/hooks/use-lang";
import { useToast } from "@/hooks/use-toast";
import { FileCheck, Loader2, Plus, Trash2 } from "lucide-react";

type PermitType = "PCOC" | "PUS" | "DEA" | "REA";
const PERMIT_TYPES: { key: PermitType; en: string; es: string }[] = [
  { key: "PCOC", en: "PCOC — Construction", es: "PCOC — Construcción" },
  { key: "PUS", en: "PUS — Use", es: "PUS — Uso" },
  { key: "DEA", en: "DEA — Scope Determination", es: "DEA — Determinación de Ámbito" },
  { key: "REA", en: "REA — Environmental Endorsement", es: "REA — Endoso Ambiental" },
];

interface ChecklistItem {
  id: string;
  description: string;
  comments?: string;
  docFilledOut: boolean;
  sent: boolean;
  received: boolean;
  fileUploadLink?: string;
}

interface Checklist {
  projectId: string;
  permitType: PermitType;
  items: ChecklistItem[];
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem("konti_auth") : null;
  let token: string | undefined;
  try { token = raw ? (JSON.parse(raw).token as string) : undefined; } catch { /* ignore */ }
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export function PermitsChecklistPanel({ projectId }: { projectId: string }) {
  const { t, lang } = useLang();
  const { toast } = useToast();
  const [activeType, setActiveType] = useState<PermitType>("PCOC");
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [newRowDesc, setNewRowDesc] = useState("");

  const loadChecklist = useCallback(async (type: PermitType) => {
    setLoading(true);
    try {
      const res = await authedFetch(`/api/projects/${projectId}/permits/${type}`);
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as Checklist;
      setChecklist(data);
    } catch {
      setChecklist(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadChecklist(activeType);
  }, [activeType, loadChecklist]);

  const toggleField = async (item: ChecklistItem, field: "docFilledOut" | "sent" | "received", value: boolean) => {
    if (!checklist) return;
    // Optimistic — flip the toggle in state first.
    setChecklist({
      ...checklist,
      items: checklist.items.map((i) => (i.id === item.id ? { ...i, [field]: value } : i)),
    });
    try {
      const res = await authedFetch(
        `/api/projects/${projectId}/permits/${activeType}/items/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        },
      );
      if (!res.ok) throw new Error("toggle_failed");
    } catch {
      // Rollback on failure.
      setChecklist((prev) => prev && {
        ...prev,
        items: prev.items.map((i) => (i.id === item.id ? { ...i, [field]: !value } : i)),
      });
      toast({ title: t("Save failed", "Falló al guardar"), variant: "destructive" });
    }
  };

  const addRow = async () => {
    const desc = newRowDesc.trim();
    if (!desc || !checklist) return;
    try {
      const res = await authedFetch(`/api/projects/${projectId}/permits/${activeType}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc }),
      });
      if (!res.ok) throw new Error("create_failed");
      const item = (await res.json()) as ChecklistItem;
      setChecklist({ ...checklist, items: [...checklist.items, item] });
      setNewRowDesc("");
    } catch {
      toast({ title: t("Could not add row", "No se pudo agregar"), variant: "destructive" });
    }
  };

  const removeRow = async (item: ChecklistItem) => {
    if (!checklist) return;
    if (!window.confirm(t(`Remove "${item.description}"?`, `¿Eliminar "${item.description}"?`))) return;
    try {
      const res = await authedFetch(
        `/api/projects/${projectId}/permits/${activeType}/items/${item.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("delete_failed");
      setChecklist({ ...checklist, items: checklist.items.filter((i) => i.id !== item.id) });
    } catch {
      toast({ title: t("Could not remove", "No se pudo eliminar"), variant: "destructive" });
    }
  };

  const completed = checklist ? checklist.items.filter((i) => i.received).length : 0;
  const total = checklist?.items.length ?? 0;

  return (
    <section className="bg-card rounded-xl border border-card-border shadow-sm p-5" data-testid="permits-checklist-panel">
      <header className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <FileCheck className="w-5 h-5 text-konti-olive" />
          {t("Permits Checklist", "Lista de Permisos")}
        </h2>
        {checklist && (
          <span className="text-xs text-muted-foreground">
            {completed}/{total} {t("received", "recibidos")}
          </span>
        )}
      </header>

      <div className="flex gap-1 border-b border-border mb-3 overflow-x-auto" role="tablist">
        {PERMIT_TYPES.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={activeType === p.key}
            onClick={() => setActiveType(p.key)}
            data-testid={`permit-tab-${p.key}`}
            className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              activeType === p.key
                ? "border-konti-olive text-konti-olive"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {lang === "es" ? p.es : p.en}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground py-3">{t("Loading…", "Cargando…")}</p>
      ) : !checklist || checklist.items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3">
          {t("No items yet. Add a checklist row below.", "Sin ítems. Agrega una fila abajo.")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border" data-testid="permits-checklist-table">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">{t("Description", "Descripción")}</th>
                <th className="text-center px-2 py-2 font-semibold text-muted-foreground">{t("Filled", "Completado")}</th>
                <th className="text-center px-2 py-2 font-semibold text-muted-foreground">{t("Sent", "Enviado")}</th>
                <th className="text-center px-2 py-2 font-semibold text-muted-foreground">{t("Received", "Recibido")}</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {checklist.items.map((item) => (
                <tr key={item.id} data-testid={`permit-row-${item.id}`}>
                  <td className="px-3 py-2 text-foreground">{item.description}</td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={item.docFilledOut}
                      onChange={(e) => toggleField(item, "docFilledOut", e.target.checked)}
                      data-testid={`permit-filled-${item.id}`}
                      aria-label={t("Document filled out", "Documento completado")}
                      className="accent-konti-olive w-4 h-4"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={item.sent}
                      onChange={(e) => toggleField(item, "sent", e.target.checked)}
                      data-testid={`permit-sent-${item.id}`}
                      aria-label={t("Sent to authority", "Enviado a autoridad")}
                      className="accent-konti-olive w-4 h-4"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={item.received}
                      onChange={(e) => toggleField(item, "received", e.target.checked)}
                      data-testid={`permit-received-${item.id}`}
                      aria-label={t("Received back", "Recibido de vuelta")}
                      className="accent-konti-olive w-4 h-4"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(item)}
                      aria-label={t("Remove row", "Eliminar fila")}
                      data-testid={`permit-remove-${item.id}`}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          value={newRowDesc}
          onChange={(e) => setNewRowDesc(e.target.value)}
          placeholder={t("New checklist item…", "Nuevo ítem…")}
          data-testid="input-new-permit-row"
          maxLength={300}
          className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-xs"
        />
        <button
          type="button"
          onClick={addRow}
          disabled={!newRowDesc.trim()}
          data-testid="btn-add-permit-row"
          className="px-3 py-2 rounded-md bg-konti-olive text-white text-xs font-semibold hover:bg-konti-olive/90 disabled:opacity-50 inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          {t("Add", "Agregar")}
        </button>
      </div>
    </section>
  );
}
