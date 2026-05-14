// P4.4 — Field-admin page.
//
// Jorge's daily surface for managing the master materials catalog,
// canonical contractors, and category taxonomy. Per the 2026-05-11
// meeting and the P4.3 role gate: only `field_admin / admin /
// superadmin` can reach this page; team users get redirected to the
// dashboard.
//
// The page is a 3-tab shell. Each tab fetches its data via the existing
// list endpoints and exposes simple CRUD where the user has rights.
// Persistence happens server-side — there's no optimistic UI here
// because Jorge needs to KNOW his save succeeded.

import { useState } from "react";
import {
  useListMaterials,
  useListContractors,
  type Material,
  type Contractor,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { RequireRole } from "@/hooks/auth-provider";
import { useLang } from "@/hooks/use-lang";
import { useToast } from "@/hooks/use-toast";
import {
  Boxes,
  HardHat,
  Tags,
  Plus,
  Trash2,
  Loader2,
  ShieldCheck,
} from "lucide-react";

const TABS = ["materials", "contractors", "categories"] as const;
type Tab = (typeof TABS)[number];

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

export default function FieldAdminPage() {
  return (
    <RequireRole roles={["field_admin", "admin", "superadmin"]}>
      <AppLayout>
        <FieldAdminBody />
      </AppLayout>
    </RequireRole>
  );
}

function FieldAdminBody() {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("materials");
  return (
    <div className="space-y-6" data-testid="field-admin-page">
      <header>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-konti-olive" />
          {t("Field Admin", "Administración Operativa")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            "Manage the master materials catalog, canonical contractors, and category taxonomy. Changes here apply to every new project.",
            "Administra el catálogo maestro de materiales, contratistas canónicos y taxonomía de categorías. Los cambios aplican a cada nuevo proyecto.",
          )}
        </p>
      </header>

      <div className="flex gap-1 border-b border-border" role="tablist">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            data-testid={`tab-${k}`}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === k
                ? "border-konti-olive text-konti-olive"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {k === "materials" && <Boxes className="w-4 h-4" />}
            {k === "contractors" && <HardHat className="w-4 h-4" />}
            {k === "categories" && <Tags className="w-4 h-4" />}
            {k === "materials"
              ? t("Materials", "Materiales")
              : k === "contractors"
                ? t("Contractors", "Contratistas")
                : t("Categories", "Categorías")}
          </button>
        ))}
      </div>

      {tab === "materials" && <MaterialsTab />}
      {tab === "contractors" && <ContractorsTab />}
      {tab === "categories" && <CategoriesTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Materials tab
// ---------------------------------------------------------------------------
function MaterialsTab() {
  const { t } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: materials = [], isLoading } = useListMaterials();

  const [item, setItem] = useState("");
  const [itemEs, setItemEs] = useState("");
  const [category, setCategory] = useState("finishes");
  const [unit, setUnit] = useState("ea");
  const [basePrice, setBasePrice] = useState("0");
  const [busy, setBusy] = useState(false);

  const addMaterial = async () => {
    if (!item.trim()) {
      toast({ title: t("Item name required", "Nombre del material requerido"), variant: "destructive" });
      return;
    }
    const price = Number(basePrice);
    if (!isFinite(price) || price < 0) {
      toast({ title: t("Invalid base price", "Precio base inválido"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // POST as a one-row CSV to the import endpoint — the import path is the
      // existing canonical "add to master materials" entry. Keeps the page
      // honest about persistence and triggers the audit log entry that the
      // existing materials/import handler already records.
      const csv =
        "item,item_es,category,unit,base_price\n" +
        `"${item.replace(/"/g, '""')}","${itemEs.replace(/"/g, '""')}",${category},${unit},${price}\n`;
      const res = await authedFetch("/api/estimating/materials/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "save_failed");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
      toast({ title: t("Material added", "Material agregado") });
      setItem("");
      setItemEs("");
      setBasePrice("0");
    } catch (err) {
      toast({
        title: t("Could not save", "No se pudo guardar"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm" data-testid="add-material-form">
        <h2 className="font-bold mb-3 text-sm flex items-center gap-2">
          <Plus className="w-4 h-4 text-konti-olive" />
          {t("Add Master Material", "Agregar Material Maestro")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
          <input
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder={t("Name (English)", "Nombre (Inglés)")}
            data-testid="input-master-item"
            className="px-3 py-2 rounded-md border border-input bg-background text-sm"
            maxLength={200}
          />
          <input
            value={itemEs}
            onChange={(e) => setItemEs(e.target.value)}
            placeholder={t("Name (Spanish)", "Nombre (Español)")}
            data-testid="input-master-item-es"
            className="px-3 py-2 rounded-md border border-input bg-background text-sm"
            maxLength={200}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            data-testid="select-master-category"
            className="px-3 py-2 rounded-md border border-input bg-background text-sm"
          >
            <option value="steel">Steel / Container</option>
            <option value="lumber">Lumber</option>
            <option value="electrical">Electrical</option>
            <option value="plumbing">Plumbing</option>
            <option value="finishes">Finishes</option>
            <option value="insulation">Insulation</option>
            <option value="foundation">Foundation</option>
          </select>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder={t("Unit", "Unidad")}
            data-testid="input-master-unit"
            className="px-3 py-2 rounded-md border border-input bg-background text-sm"
            maxLength={20}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            placeholder={t("Base price (USD)", "Precio base (USD)")}
            data-testid="input-master-price"
            className="px-3 py-2 rounded-md border border-input bg-background text-sm text-right"
          />
        </div>
        <button
          onClick={addMaterial}
          disabled={busy}
          data-testid="btn-add-master-material"
          className="mt-3 w-full md:w-auto px-4 py-2 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-50 inline-flex items-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {t("Add to master catalog", "Agregar al catálogo maestro")}
        </button>
      </div>

      <div className="bg-card rounded-xl border border-card-border shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <h2 className="font-bold text-sm">
            {t("Master Materials", "Materiales Maestros")}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({materials.length})
            </span>
          </h2>
        </div>
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">{t("Loading…", "Cargando…")}</p>
        ) : (
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-muted-foreground">{t("Item", "Material")}</th>
                  <th className="text-left px-4 py-2 font-semibold text-muted-foreground">{t("Category", "Categoría")}</th>
                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground">{t("Unit", "Unidad")}</th>
                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground">{t("Base Price", "P. Base")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {materials.map((m: Material) => (
                  <tr key={m.id} data-testid={`master-material-row-${m.id}`}>
                    <td className="px-4 py-2 text-foreground">{m.item}</td>
                    <td className="px-4 py-2 text-muted-foreground">{m.category}</td>
                    <td className="px-4 py-2 text-muted-foreground text-right">{m.unit}</td>
                    <td className="px-4 py-2 text-right font-medium">${m.basePrice.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contractors tab
// ---------------------------------------------------------------------------
function ContractorsTab() {
  const { t } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: contractors = [], isLoading } = useListContractors();

  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const addContractor = async () => {
    if (!name.trim() || !trade.trim()) {
      toast({ title: t("Name and trade required", "Nombre y oficio requeridos"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await authedFetch("/api/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          trade: trade.trim(),
          email: email.trim(),
          phone: phone.trim(),
          notes: notes.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "save_failed");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      toast({ title: t("Contractor added", "Contratista agregado") });
      setName(""); setTrade(""); setEmail(""); setPhone(""); setNotes("");
    } catch (err) {
      toast({
        title: t("Could not save", "No se pudo guardar"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const deleteContractor = async (c: Contractor) => {
    if (!window.confirm(t(`Remove ${c.name}? This cannot be undone.`, `¿Eliminar ${c.name}? No se puede deshacer.`))) return;
    try {
      const res = await authedFetch(`/api/contractors/${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete_failed");
      await queryClient.invalidateQueries({ queryKey: ["/api/contractors"] });
      toast({ title: t("Contractor removed", "Contratista eliminado") });
    } catch {
      toast({ title: t("Could not remove", "No se pudo eliminar"), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm">
        <h2 className="font-bold mb-3 text-sm flex items-center gap-2">
          <Plus className="w-4 h-4 text-konti-olive" />
          {t("Add Contractor", "Agregar Contratista")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Name", "Nombre")} data-testid="input-ctr-name" className="px-3 py-2 rounded-md border border-input bg-background text-sm" maxLength={120} />
          <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder={t("Trade (e.g. electrical)", "Oficio (ej. eléctrico)")} data-testid="input-ctr-trade" className="px-3 py-2 rounded-md border border-input bg-background text-sm" maxLength={120} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("Email", "Correo")} data-testid="input-ctr-email" className="px-3 py-2 rounded-md border border-input bg-background text-sm" maxLength={200} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("Phone", "Teléfono")} data-testid="input-ctr-phone" className="px-3 py-2 rounded-md border border-input bg-background text-sm" maxLength={60} />
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("Notes (license, specialty…)", "Notas (licencia, especialidad…)")}
          data-testid="input-ctr-notes"
          rows={2}
          maxLength={1000}
          className="mt-2 w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
        />
        <button
          onClick={addContractor}
          disabled={busy}
          data-testid="btn-add-contractor"
          className="mt-3 w-full md:w-auto px-4 py-2 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-50 inline-flex items-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {t("Add contractor", "Agregar contratista")}
        </button>
      </div>

      <div className="bg-card rounded-xl border border-card-border shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <h2 className="font-bold text-sm">
            {t("Contractors", "Contratistas")}
            <span className="ml-2 text-xs font-normal text-muted-foreground">({contractors.length})</span>
          </h2>
        </div>
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">{t("Loading…", "Cargando…")}</p>
        ) : (
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-muted-foreground">{t("Name", "Nombre")}</th>
                  <th className="text-left px-4 py-2 font-semibold text-muted-foreground">{t("Trade", "Oficio")}</th>
                  <th className="text-left px-4 py-2 font-semibold text-muted-foreground hidden md:table-cell">{t("Contact", "Contacto")}</th>
                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contractors.map((c: Contractor) => (
                  <tr key={c.id} data-testid={`contractor-row-${c.id}`}>
                    <td className="px-4 py-2 font-medium text-foreground">{c.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{c.trade}</td>
                    <td className="px-4 py-2 text-muted-foreground hidden md:table-cell text-xs">
                      {c.email}
                      {c.email && c.phone ? " · " : ""}
                      {c.phone}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => deleteContractor(c)}
                        aria-label={t(`Remove ${c.name}`, `Eliminar ${c.name}`)}
                        data-testid={`btn-remove-contractor-${c.id}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-red-200 text-red-700 hover:bg-red-50 text-xs"
                      >
                        <Trash2 className="w-3 h-3" /> {t("Remove", "Eliminar")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Categories tab (read-only for V1 — the canonical taxonomy is locked.
// Adding new categories at runtime is queued for Session 4 along with the
// matching Drizzle migration helper.)
// ---------------------------------------------------------------------------
function CategoriesTab() {
  const { t, lang } = useLang();
  const buckets = [
    { key: "design_data_collection", en: "Design & Data Collection", es: "Diseño y Recolección de Datos" },
    { key: "permits_service_fees", en: "Permits & Service Fees", es: "Permisos y Tasas de Servicio" },
    { key: "product_containers", en: "Product (Containers)", es: "Producto (Contenedores)" },
    { key: "exterior_add_ons", en: "Exterior & Add-Ons", es: "Exterior y Complementos" },
    { key: "construction_contingency", en: "Construction Contingency", es: "Contingencia de Construcción" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-card-border p-5 shadow-sm">
        <h2 className="font-bold text-sm mb-2">
          {t("Top-level buckets", "Categorías de Nivel Superior")}
        </h2>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          {t(
            "These five buckets are KONTi's canonical report taxonomy (Appendix A.1). All material and labor lines roll up into one of them. To add a new sub-category, edit lib/report-categories/src/index.ts and ship a release.",
            "Estas cinco categorías son la taxonomía canónica del reporte (Apéndice A.1). Cada material y mano de obra se agrupa en una de ellas.",
          )}
        </p>
        <ul className="space-y-2" data-testid="category-list">
          {buckets.map((b) => (
            <li
              key={b.key}
              className="flex items-center justify-between px-3 py-2 rounded-md border border-border bg-muted/30"
              data-testid={`category-${b.key}`}
            >
              <span className="font-medium text-foreground">
                {lang === "es" ? b.es : b.en}
              </span>
              <code className="text-[10px] text-muted-foreground font-mono">{b.key}</code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
