"""
Regenerates artifacts/api-server/src/data/master-materials.ts from the
canonical MATERIALS sheet in `0)_KONTI_DESIGN_PRE-DESIGN_CONSTRUCTION_ESTIMATE_*.xlsx`.

Usage:
  python scripts/regenerate-master-materials.py

Re-run whenever Jorge updates the source XLSX. Commit the updated
master-materials.ts + a short note in the commit message.
"""
import sys
import json
import io
from pathlib import Path

# Re-encode stdout in case the host terminal is cp1252.
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import openpyxl  # type: ignore

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_XLSX = REPO_ROOT / "attached_assets" / "0)_KONTI_DESIGN_PRE-DESIGN_CONSTRUCTION_ESTIMATE_-_CLIENT_NAM_1776258335689.xlsx"
TARGET_TS = REPO_ROOT / "artifacts" / "api-server" / "src" / "data" / "master-materials.ts"

# Category EN -> ES translations (locked at 2026-05-13 from the meeting taxonomy).
CAT_ES = {
    "Container Purchase": "Compra de Contenedor",
    "Structural Prep": "Preparacion Estructural",
    "Cut & Frames": "Cortes y Marcos",
    "Interior Build": "Construccion Interior",
    "Exterior Windows and Doors": "Ventanas y Puertas Exteriores",
    "Plumbing": "Plomeria",
    "Electrical": "Electrico",
    "Painting": "Pintura",
    "Consumables": "Consumibles",
    "Bathroom": "Bano",
    "Kitchen": "Cocina",
    "Finishes": "Acabados",
    "Interior Staircase": "Escalera Interior",
    "Exterior Steel Structure": "Estructura de Acero Exterior",
    "Exterior Staircase": "Escalera Exterior",
    "Decking": "Terraza",
    "Pergola": "Pergola",
    "Appliances": "Electrodomesticos",
    "Gas Connection": "Conexion de Gas",
}

# Category -> bucket key (matches lib/report-categories/src/index.ts).
CAT_BUCKET = {
    "Container Purchase": "product_containers",
    "Structural Prep": "product_containers",
    "Cut & Frames": "product_containers",
    "Interior Build": "product_containers",
    "Exterior Windows and Doors": "product_containers",
    "Plumbing": "product_containers",
    "Electrical": "product_containers",
    "Painting": "product_containers",
    "Consumables": "product_containers",
    "Bathroom": "product_containers",
    "Kitchen": "product_containers",
    "Finishes": "product_containers",
    "Interior Staircase": "product_containers",
    "Exterior Steel Structure": "exterior_add_ons",
    "Exterior Staircase": "exterior_add_ons",
    "Decking": "exterior_add_ons",
    "Pergola": "exterior_add_ons",
    "Appliances": "exterior_add_ons",
    "Gas Connection": "exterior_add_ons",
}

# Category -> trade-level color key (matches existing CAT_COLORS in calculator.tsx).
CAT_KEY = {
    "Container Purchase": "steel",
    "Structural Prep": "steel",
    "Cut & Frames": "steel",
    "Interior Build": "finishes",
    "Exterior Windows and Doors": "finishes",
    "Plumbing": "plumbing",
    "Electrical": "electrical",
    "Painting": "finishes",
    "Consumables": "finishes",
    "Bathroom": "plumbing",
    "Kitchen": "finishes",
    "Finishes": "finishes",
    "Interior Staircase": "lumber",
    "Exterior Steel Structure": "steel",
    "Exterior Staircase": "steel",
    "Decking": "lumber",
    "Pergola": "lumber",
    "Appliances": "finishes",
    "Gas Connection": "plumbing",
}


def cat_to_key(cat: str) -> str:
    """Convert a human category name to its TypeScript union-literal key."""
    return (
        cat.lower()
        .replace(" & ", "_")
        .replace("&", "and")
        .replace(" ", "_")
    )


def js_str(s: str) -> str:
    """Escape a string for safe inclusion in a TS string literal."""
    return (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "")
    )


def parse_materials() -> list[dict]:
    wb = openpyxl.load_workbook(str(SOURCE_XLSX), data_only=True)
    ws = wb["MATERIALS"]
    # Header is row 5; data starts row 6.
    # Columns (1-indexed):
    #   2 CATEGORY | 3 DESCRIPTION | 4 QTY PER CONTAINER | 5 QTY TOTAL |
    #   6 MATERIAL COST | 7 IVU | 8 CONTINGENCY | 9 MATERIAL TOTAL | 10 COMMENT
    out: list[dict] = []
    for row in ws.iter_rows(min_row=6, max_row=200, values_only=True):
        cells = list(row)
        while cells and (cells[-1] is None or str(cells[-1]).strip() == ""):
            cells.pop()
        if not cells:
            continue
        category = cells[1] if len(cells) > 1 else None
        description = cells[2] if len(cells) > 2 else None
        if not category or not description:
            continue
        qty_per_container = cells[3] if len(cells) > 3 else None
        material_cost = cells[5] if len(cells) > 5 else None
        ivu = cells[6] if len(cells) > 6 else None
        contingency = cells[7] if len(cells) > 7 else None
        comment = cells[9] if len(cells) > 9 else None

        try:
            qpc = float(qty_per_container) if qty_per_container is not None else 0.0
        except (TypeError, ValueError):
            continue
        try:
            mc = float(material_cost) if material_cost is not None else 0.0
        except (TypeError, ValueError):
            continue

        # IVU + contingency are stored in the xlsx as $ amounts. Re-derive
        # the percent so the TS module exposes the canonical 11.5% / 20%.
        ivu_pct = 11.5
        cont_pct = 20.0
        try:
            if mc > 0 and ivu is not None:
                ivu_pct = round(float(ivu) / mc * 100, 2)
        except (TypeError, ValueError, ZeroDivisionError):
            pass
        try:
            if mc > 0 and contingency is not None:
                cont_pct = round(float(contingency) / mc * 100, 2)
        except (TypeError, ValueError, ZeroDivisionError):
            pass

        out.append({
            "category": str(category).strip(),
            "description": str(description).strip(),
            "qtyPerContainer": qpc,
            "materialCost": mc,
            "ivuPercent": ivu_pct,
            "contingencyPercent": cont_pct,
            "comment": str(comment).strip() if comment else None,
        })
    wb.close()
    return out


def render_ts(rows: list[dict]) -> str:
    cats_sorted = sorted(CAT_ES.keys())
    L: list[str] = []
    L.append("// AUTO-GENERATED from `attached_assets/0)_KONTI_DESIGN_PRE-DESIGN_CONSTRUCTION_ESTIMATE_-_CLIENT_NAM_*.xlsx`")
    L.append("// MATERIALS sheet, rows 6-113. Source taxonomy locked at 2026-05-13.")
    L.append("//")
    L.append("// KONTi's canonical master materials list - the 19 categories and ~107 line")
    L.append("// items that every new project starts with. Per the 2026-05-11 meeting:")
    L.append("// \"todos los materiales queden cargados por defecto en la calculadora\".")
    L.append("//")
    L.append("// Per replit.md policy, seed.ts is read-only at runtime. This module sits")
    L.append("// alongside seed.ts and is referenced by the lead-accept handler to")
    L.append("// pre-populate the per-project calculator (P1.2).")
    L.append("//")
    L.append("// To refresh: re-run scripts/regenerate-master-materials.py after Jorge")
    L.append("// updates the source XLSX. Commit the updated file in a single commit.")
    L.append("")
    L.append('import type { ReportBucketKey } from "@workspace/report-categories";')
    L.append("")
    L.append("export type MasterMaterialCategoryKey =")
    for i, c in enumerate(cats_sorted):
        key = cat_to_key(c)
        # Union literals: each line gets a LEADING `|` only; the last line
        # ends with `;`. No trailing pipe (`| "a" |` is a parse error).
        suffix = ";" if i == len(cats_sorted) - 1 else ""
        L.append(f'  | "{key}"{suffix}')
    L.append("")
    L.append("export interface MasterMaterialCategoryMeta {")
    L.append("  key: MasterMaterialCategoryKey;")
    L.append("  labelEn: string;")
    L.append("  labelEs: string;")
    L.append("  /** Top-level report bucket - matches `lib/report-categories`. */")
    L.append("  bucket: ReportBucketKey;")
    L.append("  /** Trade-level color key for the existing calculator `CAT_COLORS` map. */")
    L.append('  legacyTradeKey: "steel" | "lumber" | "electrical" | "plumbing" | "finishes" | "insulation" | "foundation";')
    L.append("}")
    L.append("")
    L.append("export const MASTER_MATERIAL_CATEGORIES: ReadonlyArray<MasterMaterialCategoryMeta> = [")
    for c in cats_sorted:
        key = cat_to_key(c)
        es = CAT_ES[c]
        bucket = CAT_BUCKET[c]
        trade = CAT_KEY[c]
        L.append(f'  {{ key: "{key}", labelEn: "{js_str(c)}", labelEs: "{js_str(es)}", bucket: "{bucket}", legacyTradeKey: "{trade}" }},')
    L.append("] as const;")
    L.append("")
    L.append("export interface MasterMaterialLine {")
    L.append("  /** Stable cross-row id derived from category+index (no Date.now()). */")
    L.append("  id: string;")
    L.append("  category: MasterMaterialCategoryKey;")
    L.append("  description: string;")
    L.append("  /** Canonical qty for ONE container. `qtyTotal` = `qtyPerContainer * project.containerCount` (P1.3). */")
    L.append("  qtyPerContainer: number;")
    L.append("  /** Base material cost in USD per unit (pre-IVU, pre-contingency). */")
    L.append("  materialCost: number;")
    L.append("  /** Puerto Rico sales tax. Default 11.5% per the source xlsx. */")
    L.append("  ivuPercent: number;")
    L.append("  /** Per-line contingency reserve. Default 20% per the source xlsx. */")
    L.append("  contingencyPercent: number;")
    L.append("  /** Optional human note from the source xlsx (e.g. \"For Metal Frames\"). */")
    L.append("  comment?: string;")
    L.append("}")
    L.append("")
    L.append("export const KONTI_MASTER_MATERIALS_2026: ReadonlyArray<MasterMaterialLine> = [")
    counters: dict[str, int] = {}
    for row in rows:
        cat = row["category"]
        key = cat_to_key(cat)
        counters[key] = counters.get(key, 0) + 1
        rid = f"mm-{key}-{counters[key]:03d}"
        desc = js_str(row["description"])
        qpc = row["qtyPerContainer"]
        mc = row["materialCost"]
        ivu = row["ivuPercent"]
        cont = row["contingencyPercent"]
        comment = row.get("comment")
        comment_part = f', comment: "{js_str(comment)}"' if comment else ""
        L.append(f'  {{ id: "{rid}", category: "{key}", description: "{desc}", qtyPerContainer: {qpc}, materialCost: {mc}, ivuPercent: {ivu}, contingencyPercent: {cont}{comment_part} }},')
    L.append("] as const;")
    L.append("")
    L.append("/** Count of master rows - sanity-check value for migration tests. */")
    L.append(f"export const MASTER_MATERIALS_ROW_COUNT = {len(rows)};")
    L.append("")
    L.append("/** Lookup the category meta by key. Returns undefined for unknown keys. */")
    L.append("export function masterCategoryMeta(key: string): MasterMaterialCategoryMeta | undefined {")
    L.append("  return MASTER_MATERIAL_CATEGORIES.find((c) => c.key === key);")
    L.append("}")
    L.append("")
    return "\n".join(L)


def main() -> None:
    rows = parse_materials()
    ts = render_ts(rows)
    TARGET_TS.write_text(ts, encoding="utf-8")
    cats_set = sorted({r["category"] for r in rows})
    print(f"Wrote {TARGET_TS}")
    print(f"  {len(rows)} material rows, {len(cats_set)} categories")
    for c in cats_set:
        n = sum(1 for r in rows if r["category"] == c)
        print(f"    {c}: {n} items")


if __name__ == "__main__":
    main()
