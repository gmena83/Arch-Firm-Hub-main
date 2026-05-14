// P1.2 — Seed a freshly-created project's calculator with the canonical
// master materials list. Called from the lead-accept handler.
//
// Per the 2026-05-11 meeting, every new project must start with KONTi's
// full materials master list pre-populated so the team can subtract
// (rather than add) when building an estimate. The team uses Delete or
// sets qty to 0 for items that don't apply.
//
// Per `replit.md` policy, this lives OUTSIDE seed.ts so the seed file
// stays the read-only bootstrap fixture.

import { CALCULATOR_ENTRIES } from "../data/seed";
import {
  KONTI_MASTER_MATERIALS_2026,
  masterCategoryMeta,
  type MasterMaterialLine,
} from "../data/master-materials";
import {
  persistCalculatorEntriesForProject,
} from "./calculator-persistence";
import type { CalculatorEntry } from "./estimating-store";

// Convert one master-material row into a per-project CalculatorEntry.
// The master id is namespaced with the projectId so the same master row
// in two different projects has distinct calculator-entry IDs.
function masterToCalculatorEntry(
  row: MasterMaterialLine,
  projectId: string,
  containerCount: number,
): CalculatorEntry {
  const qty = row.qtyPerContainer * Math.max(1, containerCount);
  const meta = masterCategoryMeta(row.category);
  return {
    id: `${projectId}-${row.id}`,
    projectId,
    materialId: row.id,
    materialName: row.description,
    // We don't have per-line Spanish translations in the master xlsx, so
    // we duplicate the English description into the ES slot. The team can
    // edit the calculator-entry directly to add a Spanish variant for
    // items they bill bilingually.
    materialNameEs: row.description,
    // Use the legacy trade key so the existing calculator CAT_COLORS map
    // and report-categories rollup keep working without changes.
    category: meta?.legacyTradeKey ?? "finishes",
    unit: "ea",
    quantity: qty,
    basePrice: row.materialCost,
    manualPriceOverride: null,
    effectivePrice: row.materialCost,
    lineTotal: row.materialCost * qty,
  };
}

/**
 * P6.4 — Variant selector. For V1 both variants ship with identical pricing;
 * the field is forward-compatible until Jorge supplies the rural-only price
 * adjustments. When a rural-specific master list is added, swap this function
 * to return a different array per variant.
 */
function masterMaterialsForVariant(_variant: "urban" | "rural"): typeof KONTI_MASTER_MATERIALS_2026 {
  // Today both variants point at the same array. Replace this when Jorge's
  // rural pricing lands by introducing `KONTI_MASTER_MATERIALS_2026_RURAL`
  // in `data/master-materials.ts` and returning it for variant === "rural".
  return KONTI_MASTER_MATERIALS_2026;
}

/**
 * Populate a project's calculator with the canonical master-materials list.
 *
 * - **Idempotent**: if the calculator already has rows for this project (e.g.
 *   from a previous accept that was rolled back without cleanup), this is a
 *   no-op. The team's edits are never overwritten.
 * - **Awaits persistence**: the function only returns once the DB commit has
 *   flushed, matching the `replit.md` durability contract.
 * - **No errors are silently swallowed**: a persistence failure bubbles up
 *   as a PersistFailedError so the lead-accept handler can respond 500.
 *
 * @param projectId  the newly-synthesized project
 * @param containerCount  number of containers in the project; multiplies the
 *   per-container qty from each master row. Default 1.
 * @param variant  P6.4 — "urban" (default) or "rural"; selects which master
 *   materials list to seed. Both variants currently share the same pricing.
 */
export async function seedCalculatorWithMasterMaterials(
  projectId: string,
  containerCount = 1,
  variant: "urban" | "rural" = "urban",
): Promise<{ seeded: number }> {
  const map = CALCULATOR_ENTRIES as unknown as Record<string, CalculatorEntry[]>;
  // Idempotency: skip if the project already has rows.
  if (Array.isArray(map[projectId]) && map[projectId].length > 0) {
    return { seeded: 0 };
  }
  const source = masterMaterialsForVariant(variant);
  const entries: CalculatorEntry[] = source.map((row) =>
    masterToCalculatorEntry(row, projectId, containerCount),
  );
  map[projectId] = entries;
  await persistCalculatorEntriesForProject(projectId);
  return { seeded: entries.length };
}

/**
 * Recompute every non-overridden calculator line's qty + lineTotal when the
 * project's container count changes (P1.3).
 *
 * Rows with `manualPriceOverride` set are left alone for their price but qty
 * is still multiplied — overriding the *price* is independent of multiplying
 * the *qty* with container count.
 *
 * Returns the count of rows updated.
 */
export async function reapplyContainerCount(
  projectId: string,
  newContainerCount: number,
): Promise<{ updated: number }> {
  const map = CALCULATOR_ENTRIES as unknown as Record<string, CalculatorEntry[]>;
  const list = map[projectId];
  if (!Array.isArray(list) || list.length === 0) return { updated: 0 };
  // Build a lookup from masterMaterialId → qtyPerContainer so we know the
  // base multiplier. Rows added manually by the team (not from the master
  // list) have no master row — we leave their qty untouched.
  const masterByMaterialId = new Map(
    KONTI_MASTER_MATERIALS_2026.map((m) => [m.id, m]),
  );
  let updated = 0;
  for (const entry of list) {
    const master = masterByMaterialId.get(entry.materialId);
    if (!master) continue; // custom line — leave alone
    const newQty = master.qtyPerContainer * Math.max(1, newContainerCount);
    if (newQty !== entry.quantity) {
      entry.quantity = newQty;
      entry.lineTotal = entry.effectivePrice * newQty;
      updated++;
    }
  }
  await persistCalculatorEntriesForProject(projectId);
  return { updated };
}
