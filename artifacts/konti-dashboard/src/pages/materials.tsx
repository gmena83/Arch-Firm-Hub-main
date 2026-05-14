import { useState, useCallback } from "react";
import { useListMaterials, getListMaterialsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { RequireAuth } from "@/hooks/auth-provider";
import { useLang } from "@/hooks/use-lang";
import { Search, Package, RefreshCw, CheckCircle, AlertCircle, Upload, Plus, X, Loader2 } from "lucide-react";
import { Link } from "wouter";

const CATEGORIES = [
  { key: "all", label: "All", labelEs: "Todos" },
  { key: "steel", label: "Steel", labelEs: "Acero" },
  { key: "foundation", label: "Foundation", labelEs: "Fundación" },
  { key: "lumber", label: "Lumber", labelEs: "Madera" },
  { key: "electrical", label: "Electrical", labelEs: "Eléctrico" },
  { key: "plumbing", label: "Plumbing", labelEs: "Plomería" },
  { key: "finishes", label: "Finishes", labelEs: "Acabados" },
  { key: "insulation", label: "Insulation", labelEs: "Aislamiento" },
];

const CAT_COLORS: Record<string, string> = {
  steel: "bg-slate-100 text-slate-700",
  foundation: "bg-stone-100 text-stone-700",
  lumber: "bg-amber-100 text-amber-700",
  electrical: "bg-yellow-100 text-yellow-700",
  plumbing: "bg-sky-100 text-sky-700",
  finishes: "bg-pink-100 text-pink-700",
  insulation: "bg-purple-100 text-purple-700",
};

type PriceMap = Record<string, { price: number; source: string; updated: boolean }>;

function formatRelativeTime(isoString: string, lang: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return lang === "es" ? "hace un momento" : "just now";
  if (minutes === 1) return lang === "es" ? "hace 1 minuto" : "1 minute ago";
  if (minutes < 60) return lang === "es" ? `hace ${minutes} minutos` : `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  return lang === "es" ? `hace ${hours} hora${hours > 1 ? "s" : ""}` : `${hours} hour${hours > 1 ? "s" : ""} ago`;
}

export default function MaterialsPage() {
  const { t, lang } = useLang();
  const queryClient = useQueryClient();
  const { data: materials = [], isLoading } = useListMaterials();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const [priceMap, setPriceMap] = useState<PriceMap>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [priceSource, setPriceSource] = useState<string | null>(null);

  // Add-Material modal state (#B-13). Posts a single material via the existing
  // /api/estimating/materials/import endpoint (which already accepts a JSON
  // `materials` array) so we don't need a new backend route.
  const [showAddModal, setShowAddModal] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addItem, setAddItem] = useState("");
  const [addItemEs, setAddItemEs] = useState("");
  const [addCategory, setAddCategory] = useState("steel");
  const [addUnit, setAddUnit] = useState("unit");
  const [addPrice, setAddPrice] = useState("");

  const resetAddForm = () => {
    setAddItem("");
    setAddItemEs("");
    setAddCategory("steel");
    setAddUnit("unit");
    setAddPrice("");
    setAddError(null);
  };

  const submitAddMaterial = useCallback(async () => {
    setAddError(null);
    const trimmedItem = addItem.trim();
    const trimmedEs = (addItemEs.trim() || trimmedItem);
    const priceNum = Number(addPrice.replace(/[^0-9.]/g, ""));
    if (!trimmedItem) {
      setAddError(t("Item name is required.", "El nombre del material es obligatorio."));
      return;
    }
    if (!addUnit.trim()) {
      setAddError(t("Unit is required.", "La unidad es obligatoria."));
      return;
    }
    if (!isFinite(priceNum) || priceNum <= 0) {
      setAddError(t("Base price must be greater than zero.", "El precio base debe ser mayor que cero."));
      return;
    }
    setAddBusy(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("konti_auth") : null;
      let token: string | undefined;
      try { token = raw ? (JSON.parse(raw).token as string) : undefined; } catch { /* ignore */ }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const resp = await fetch(`${base}/api/estimating/materials/import`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          materials: [{
            item: trimmedItem,
            item_es: trimmedEs,
            category: addCategory,
            unit: addUnit.trim(),
            base_price: priceNum,
          }],
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { message?: string };
        setAddError(err.message ?? t("Failed to add material.", "Error al añadir el material."));
        return;
      }
      const data = await resp.json() as { imported: number; skipped: number };
      if (data.imported < 1) {
        setAddError(t("Material was rejected — please check the values.", "Material rechazado — revise los valores."));
        return;
      }
      // Refresh the catalog so the new material shows up immediately.
      await queryClient.invalidateQueries({ queryKey: getListMaterialsQueryKey() });
      resetAddForm();
      setShowAddModal(false);
    } catch {
      setAddError(t("Network error while saving material.", "Error de red al guardar el material."));
    } finally {
      setAddBusy(false);
    }
  }, [addItem, addItemEs, addCategory, addUnit, addPrice, queryClient, t]);

  const handleRefreshPrices = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const resp = await fetch(`${base}/api/materials/prices/refresh`, { method: "POST" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { message?: string };
        if (resp.status === 501) {
          setRefreshError(t(
            "Perplexity API key not configured. Contact your administrator.",
            "Clave de Perplexity no configurada. Contacte al administrador."
          ));
        } else {
          setRefreshError(err.message ?? t("Price refresh failed.", "Error al actualizar precios."));
        }
        return;
      }
      const data = await resp.json() as {
        prices: Array<{ id: string; item: string; suggestedPrice: number; source: string }>;
        refreshedAt: string;
        source: string;
        cached: boolean;
      };
      const map: PriceMap = {};
      for (const p of data.prices) {
        map[p.id] = { price: p.suggestedPrice, source: p.source, updated: true };
      }
      setPriceMap(map);
      setLastRefreshedAt(data.refreshedAt);
      setPriceSource(data.source);
    } catch {
      setRefreshError(t("Network error during price refresh.", "Error de red al actualizar precios."));
    } finally {
      setIsRefreshing(false);
    }
  }, [t]);

  const filtered = materials.filter((mat) => {
    const matchCat = activeCategory === "all" || mat.category === activeCategory;
    const q = search.toLowerCase();
    const matchSearch = !q || mat.item.toLowerCase().includes(q) || mat.itemEs.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  return (
    <RequireAuth>
      <AppLayout>
        <div className="space-y-6" data-testid="materials-page">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                <Package className="w-5 h-5 sm:w-6 sm:h-6 text-konti-olive shrink-0" />
                {t("Materials Library", "Biblioteca de Materiales")}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {t("Reference catalog of all construction materials.", "Catálogo de referencia de todos los materiales de construcción.")}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => { resetAddForm(); setShowAddModal(true); }}
              data-testid="btn-add-materials"
              className="flex items-center gap-2 px-4 py-2 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("Add Material", "Añadir Material")}
            </button>
            <Link
              href="/calculator?tab=imports"
              data-testid="btn-import-materials"
              className="flex items-center gap-2 px-4 py-2 bg-card hover:bg-muted text-foreground border border-card-border text-sm font-semibold rounded-md transition-colors"
            >
              <Upload className="w-4 h-4" />
              {t("Import CSV", "Importar CSV")}
            </Link>
            <button
              onClick={handleRefreshPrices}
              disabled={isRefreshing}
              data-testid="btn-refresh-prices"
              className="flex items-center gap-2 px-4 py-2 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing
                ? t("Refreshing...", "Actualizando...")
                : t("Refresh Prices", "Actualizar Precios")}
            </button>
            </div>
          </div>

          {refreshError && (
            <div
              data-testid="refresh-error"
              className="flex items-start gap-2 px-4 py-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{refreshError}</span>
            </div>
          )}

          {lastRefreshedAt && !refreshError && (
            <div
              data-testid="refresh-success-banner"
              className="flex items-center gap-2 px-4 py-2.5 bg-konti-olive/10 border border-konti-olive/30 rounded-lg text-sm text-konti-olive"
            >
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>
                {t("Prices updated", "Precios actualizados")} &middot;{" "}
                {formatRelativeTime(lastRefreshedAt, lang)} &middot;{" "}
                <span className="text-muted-foreground">
                  {t("Prices sourced from public listings", "Precios obtenidos de listados públicos")} ({priceSource?.split("·")[0]?.trim()})
                </span>
              </span>
            </div>
          )}

          {/* Search + category filters */}
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search materials...", "Buscar materiales...")}
                data-testid="materials-search"
                className="w-full pl-9 pr-4 py-2.5 rounded-md border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex flex-wrap gap-2" data-testid="category-filters">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  data-testid={`filter-cat-${cat.key}`}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    activeCategory === cat.key
                      ? "bg-konti-olive text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {lang === "es" ? cat.labelEs : cat.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => <div key={i} className="h-12 bg-card rounded-lg border animate-pulse" />)}
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-card-border shadow-sm overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]" data-testid="materials-table">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("Material", "Material")}</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">
                      {t("Spanish Name", "Nombre en Español")}
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("Category", "Categoría")}</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("Unit", "Unidad")}</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">{t("Base Price", "Precio Base")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((mat) => {
                    const refreshed = priceMap[mat.id];
                    const displayPrice = refreshed ? refreshed.price : mat.basePrice;
                    return (
                      <tr key={mat.id} data-testid={`material-row-${mat.id}`} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{mat.item}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{mat.itemEs}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[mat.category] ?? "bg-gray-100 text-gray-700"}`}>
                            {mat.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{mat.unit}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-foreground">${displayPrice.toLocaleString()}</span>
                          {refreshed && (
                            <span
                              data-testid={`price-updated-badge-${mat.id}`}
                              className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded bg-konti-olive/15 text-konti-olive"
                            >
                              {t("updated", "actualizado")}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        {t("No materials found.", "No se encontraron materiales.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">{filtered.length} {t("items shown", "elementos mostrados")}</p>
        </div>

        {/* Add Material modal (#B-13) — single-row counterpart to the bulk
            CSV import flow on the calculator/imports tab. */}
        {showAddModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            data-testid="add-material-modal"
            onClick={(e) => { if (e.target === e.currentTarget && !addBusy) setShowAddModal(false); }}
          >
            <div className="bg-card rounded-xl border border-card-border shadow-lg w-full max-w-md p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Plus className="w-5 h-5 text-konti-olive" />
                    {t("Add Material", "Añadir Material")}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t(
                      "Add a single material to the catalog. For bulk uploads, use Import CSV.",
                      "Añade un solo material al catálogo. Para cargas masivas, usa Importar CSV.",
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { if (!addBusy) setShowAddModal(false); }}
                  data-testid="btn-add-material-close"
                  aria-label={t("Close", "Cerrar")}
                  className="p-1 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-50"
                  disabled={addBusy}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t("Item name (English)", "Nombre del material (Inglés)")} *
                  </label>
                  <input
                    type="text"
                    value={addItem}
                    onChange={(e) => setAddItem(e.target.value)}
                    data-testid="input-add-material-item"
                    placeholder={t("e.g. Bamboo Flooring", "p.ej. Piso de Bambú")}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-konti-olive/40"
                    disabled={addBusy}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t("Item name (Spanish)", "Nombre del material (Español)")}
                    <span className="text-muted-foreground font-normal ml-1">
                      {t("(optional, defaults to English)", "(opcional, usa el inglés)")}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={addItemEs}
                    onChange={(e) => setAddItemEs(e.target.value)}
                    data-testid="input-add-material-item-es"
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-konti-olive/40"
                    disabled={addBusy}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1">
                      {t("Category", "Categoría")} *
                    </label>
                    <select
                      value={addCategory}
                      onChange={(e) => setAddCategory(e.target.value)}
                      data-testid="select-add-material-category"
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-konti-olive/40"
                      disabled={addBusy}
                    >
                      {CATEGORIES.filter((c) => c.key !== "all").map((c) => (
                        <option key={c.key} value={c.key}>
                          {lang === "es" ? c.labelEs : c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1">
                      {t("Unit", "Unidad")} *
                    </label>
                    <input
                      type="text"
                      value={addUnit}
                      onChange={(e) => setAddUnit(e.target.value)}
                      data-testid="input-add-material-unit"
                      placeholder={t("unit, sqft, roll…", "unidad, sqft, rollo…")}
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-konti-olive/40"
                      disabled={addBusy}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    {t("Base price (USD)", "Precio base (USD)")} *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={addPrice}
                      onChange={(e) => setAddPrice(e.target.value)}
                      data-testid="input-add-material-price"
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-konti-olive/40"
                      disabled={addBusy}
                    />
                  </div>
                </div>
              </div>

              {addError && (
                <div
                  data-testid="add-material-error"
                  className="flex items-start gap-2 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-md text-xs text-destructive"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{addError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { if (!addBusy) setShowAddModal(false); }}
                  data-testid="btn-add-material-cancel"
                  className="px-3 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-md disabled:opacity-50"
                  disabled={addBusy}
                >
                  {t("Cancel", "Cancelar")}
                </button>
                <button
                  type="button"
                  onClick={submitAddMaterial}
                  data-testid="btn-add-material-submit"
                  className="flex items-center gap-2 px-4 py-2 bg-konti-olive hover:bg-konti-olive/90 text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-50"
                  disabled={addBusy}
                >
                  {addBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {addBusy ? t("Saving…", "Guardando…") : t("Save Material", "Guardar Material")}
                </button>
              </div>
            </div>
          </div>
        )}
      </AppLayout>
    </RequireAuth>
  );
}
