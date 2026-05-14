// Smart CSV column mapping for the calculator imports.
// Lets the team upload a spreadsheet whose headers don't exactly match the
// canonical schema fields the importer expects. Each canonical field maps to
// a list of EN/ES synonyms; auto-detect picks the best match per source
// header, and the user can override every mapping in the import dialog.

export type ImportKind = "materials" | "labor" | "receipts";

export interface CanonicalField {
  key: string;
  labelEn: string;
  labelEs: string;
  required: boolean;
  synonyms: string[];
}

const NORMALIZE_RE = /[\s_\-/().¿?¡!:;]+/g;

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(NORMALIZE_RE, "")
    .trim();
}

export const CANONICAL_FIELDS: Record<ImportKind, CanonicalField[]> = {
  materials: [
    {
      key: "item",
      labelEn: "Item / material name",
      labelEs: "Artículo / material",
      required: true,
      synonyms: ["item", "material", "name", "description", "descripcion", "descripción", "articulo", "artículo", "producto"],
    },
    {
      key: "item_es",
      labelEn: "Item (Spanish)",
      labelEs: "Artículo (Español)",
      required: false,
      synonyms: ["item_es", "itemes", "item es", "nombre", "nombre_es", "descripcion_es", "descripción_es"],
    },
    {
      key: "category",
      labelEn: "Category",
      labelEs: "Categoría",
      required: true,
      synonyms: ["category", "categoria", "categoría", "grupo", "tipo", "section", "seccion", "sección"],
    },
    {
      key: "unit",
      labelEn: "Unit (sqft, unit, roll, …)",
      labelEs: "Unidad (sqft, ud, rollo, …)",
      required: true,
      synonyms: ["unit", "unidad", "uom", "medida", "u/m", "um"],
    },
    {
      key: "base_price",
      labelEn: "Base / unit price",
      labelEs: "Precio base / unitario",
      required: true,
      synonyms: ["base_price", "baseprice", "unit_price", "unitprice", "price", "precio", "precio_unitario", "preciounitario", "precio unitario", "costo", "cost"],
    },
    {
      key: "qty",
      labelEn: "Quantity (optional)",
      labelEs: "Cantidad (opcional)",
      required: false,
      synonyms: ["qty", "quantity", "cantidad", "cant"],
    },
  ],
  labor: [
    {
      key: "trade",
      labelEn: "Trade",
      labelEs: "Oficio",
      required: true,
      synonyms: ["trade", "oficio", "trabajo", "skill", "rol", "role"],
    },
    {
      key: "trade_es",
      labelEn: "Trade (Spanish)",
      labelEs: "Oficio (Español)",
      required: false,
      synonyms: ["trade_es", "tradees", "trade es", "oficio_es", "oficioes", "nombre_es"],
    },
    {
      key: "unit",
      labelEn: "Unit (hour, day, …)",
      labelEs: "Unidad (hora, día, …)",
      required: false,
      synonyms: ["unit", "unidad", "uom"],
    },
    {
      key: "hourly_rate",
      labelEn: "Hourly rate",
      labelEs: "Tarifa por hora",
      required: true,
      synonyms: ["hourly_rate", "hourlyrate", "hourly rate", "rate", "tarifa", "tarifa_por_hora", "tarifaporhora", "precio_hora", "preciohora", "$/hr", "$/h"],
    },
  ],
  receipts: [
    {
      key: "vendor",
      labelEn: "Vendor / supplier",
      labelEs: "Proveedor / tienda",
      required: true,
      synonyms: ["vendor", "proveedor", "supplier", "tienda", "store", "comercio"],
    },
    {
      key: "date",
      labelEn: "Date (YYYY-MM-DD)",
      labelEs: "Fecha (AAAA-MM-DD)",
      required: false,
      synonyms: ["date", "fecha", "transaction_date", "fecha_transaccion"],
    },
    {
      key: "trade",
      labelEn: "Trade",
      labelEs: "Oficio",
      required: true,
      synonyms: ["trade", "oficio", "trabajo", "category", "categoria"],
    },
    {
      key: "amount",
      labelEn: "Amount ($)",
      labelEs: "Monto ($)",
      required: true,
      synonyms: ["amount", "monto", "total", "subtotal", "importe", "valor"],
    },
    {
      key: "hours",
      labelEn: "Hours worked",
      labelEs: "Horas trabajadas",
      required: true,
      synonyms: ["hours", "horas", "horas_trabajadas", "horastrabajadas", "hrs", "h"],
    },
  ],
};

// A mapping is { canonicalFieldKey: sourceHeaderName | null }
export type Mapping = Record<string, string | null>;

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(input: string): ParsedCsv {
  const lines = input.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (l: string) => splitCsvRow(l);
  const headers = split(lines[0] ?? "");
  const rows = lines.slice(1).map(split);
  return { headers, rows };
}

function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') { inQuotes = true; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Auto-detect: for each canonical field, find the source header whose
// normalized form matches one of the field's synonyms. Returns null when no
// header matches (the user picks one in the dialog).
export function autoDetectMapping(kind: ImportKind, headers: string[]): Mapping {
  const fields = CANONICAL_FIELDS[kind];
  const normalizedHeaders = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  const used = new Set<string>();
  const out: Mapping = {};
  for (const f of fields) {
    const synSet = new Set(f.synonyms.map(normalizeHeader));
    const match = normalizedHeaders.find((h) => !used.has(h.raw) && synSet.has(h.norm));
    if (match) {
      out[f.key] = match.raw;
      used.add(match.raw);
    } else {
      out[f.key] = null;
    }
  }
  return out;
}

// Apply a mapping to a parsed CSV and return a list of { canonicalKey: value }
// dicts. Source headers not in the mapping are silently ignored.
export function applyMapping(parsed: ParsedCsv, mapping: Mapping): Array<Record<string, string>> {
  const headerIndex: Record<string, number> = {};
  parsed.headers.forEach((h, i) => { headerIndex[h] = i; });
  return parsed.rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [canonical, source] of Object.entries(mapping)) {
      if (!source) continue;
      const idx = headerIndex[source];
      if (idx === undefined) continue;
      out[canonical] = row[idx] ?? "";
    }
    return out;
  });
}

// Validate a mapping — returns list of missing required canonical fields.
export function validateMapping(kind: ImportKind, mapping: Mapping): string[] {
  return CANONICAL_FIELDS[kind]
    .filter((f) => f.required && !mapping[f.key])
    .map((f) => f.key);
}

// Server-backed mapping memory — remembered per project + importer kind on
// the project's sidecar store so any team member opening the same project
// gets the previously confirmed mapping. Falls back to null on any error.
import { getJson, putJson } from "./estimating-helpers";

export async function loadSavedMapping(projectId: string, kind: ImportKind): Promise<Mapping | null> {
  if (!projectId) return null;
  try {
    const res = await getJson<{
      projectId: string;
      mappings: Partial<Record<ImportKind, Mapping>>;
    }>(`/api/projects/${encodeURIComponent(projectId)}/csv-mappings`);
    const m = res.mappings?.[kind];
    return m && typeof m === "object" ? m : null;
  } catch {
    return null;
  }
}

export async function saveMapping(projectId: string, kind: ImportKind, mapping: Mapping): Promise<void> {
  if (!projectId) return;
  try {
    await putJson(`/api/projects/${encodeURIComponent(projectId)}/csv-mappings/${kind}`, { mapping });
  } catch {
    // best-effort; do not block import on persistence failure
  }
}
