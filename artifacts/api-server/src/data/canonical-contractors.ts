// P4.5 — Canonical KONTi contractor + stakeholder directory.
//
// Extracted from `1b)_KONTI_DESIGN_CONSTRUCTION_ESTIMATE_-_BENITO_COLON_*.xlsx`
// DATA sheet (rows 44-65 — STAKEHOLDERS DATA) and `2b)_CONTRACTOR_MONITORING_REPORT`
// sheet names. Locked at 2026-05-13 from the meeting taxonomy.
//
// Per `replit.md` policy, seed.ts is read-only at runtime. This module
// sits alongside seed.ts and is referenced by the boot-time idempotent
// migration that seeds the CONTRACTORS array on first launch (and never
// re-runs because of the `lifecycle_migrations` marker).

import type { Contractor } from "./seed";

export interface MasterContractor {
  /** Stable canonical id; survives across deploys. */
  id: string;
  name: string;
  /** Trade key — matches lib/report-categories TRADE_LABELS keys when possible. */
  trade: string;
  email: string;
  phone: string;
  /** Short biographical / scope note for the team to scan. */
  notes: string;
  /** When true, this is an INTERNAL team stakeholder with a billable rate. */
  isInternal?: boolean;
  /** Bill rate in USD/hr (internal stakeholders only). */
  billRate?: number;
  /** Role for the team's stakeholder card (internal only). */
  role?: string;
}

/**
 * KONTi's internal stakeholders. Sourced from file `1b)` DATA sheet rows 46-49.
 * These render in the contractor directory tagged as "team" so they're visually
 * separate from external contractors.
 */
export const KONTI_INTERNAL_STAKEHOLDERS: ReadonlyArray<MasterContractor> = [
  {
    id: "stk-carla-gautier",
    name: "Carla Gautier",
    trade: "Architect",
    email: "carla@kontidesign.com",
    phone: "",
    notes: "Lead architect; project lead for client-facing communications.",
    isInternal: true,
    billRate: 75,
    role: "Architect",
  },
  {
    id: "stk-jorge-rosa",
    name: "Jorge Rosa",
    trade: "Project Management",
    email: "jorge@kontidesign.com",
    phone: "",
    notes: "Project manager + Field Admin (validates new master materials/categories).",
    isInternal: true,
    billRate: 50,
    role: "Project Manager / Field Admin",
  },
  {
    id: "stk-michelle-telon",
    name: "Michelle Telon",
    trade: "Design",
    email: "michelle.telon@kontidesign.com",
    phone: "",
    notes: "Lead designer; runs the schematic + design development phases.",
    isInternal: true,
    billRate: 25,
    role: "Lead Designer",
  },
  {
    id: "stk-andrea-camacho",
    name: "Andrea Camacho",
    trade: "Construction Management",
    email: "",
    phone: "",
    notes: "Construction manager; on-site supervision during the construction phase.",
    isInternal: true,
    billRate: 50,
    role: "Construction Manager",
  },
  {
    id: "stk-nainoshka-pagan",
    name: "Nainoshka Pagán",
    trade: "Construction Management",
    email: "nainoshka@kontidesign.com",
    phone: "",
    notes: "Construction manager (per 2c) ProgressReport sheet).",
    isInternal: true,
    billRate: 50,
    role: "Construction Manager",
  },
];

/**
 * External contractors KONTi works with regularly. Sourced from file `1b)`
 * DATA sheet rows 50-65 and `2b)` Contractor Monitoring tabs.
 *
 * Each contractor is tagged with the trade key from `lib/report-categories`
 * so the team can filter by trade when assigning work.
 */
export const KONTI_CANONICAL_CONTRACTORS: ReadonlyArray<MasterContractor> = [
  {
    id: "ctr-jf-broker",
    name: "JF Broker Unlimited Corp",
    trade: "container_purchase",
    email: "",
    phone: "",
    notes: "Container purchase. Bills around $5,000/40ft High Cube.",
  },
  {
    id: "ctr-mf-solution",
    name: "MF Solution Corp",
    trade: "container_installation",
    email: "",
    phone: "",
    notes: "Container transport (shop → site) + crane setup.",
  },
  {
    id: "ctr-north-steel",
    name: "North Steel",
    trade: "structural_prep",
    email: "",
    phone: "",
    notes: "Structural reinforcement on container shells.",
  },
  {
    id: "ctr-soldadura-rizoma",
    name: "Soldadura Rizoma",
    trade: "structural_prep",
    email: "",
    phone: "",
    notes: "Welding + cuts & frames + container welding to plates. (Jordy Medina)",
  },
  {
    id: "ctr-edgardo-javier",
    name: "Edgardo Javier",
    trade: "container_finishes",
    email: "",
    phone: "",
    notes: "Primer, structural paint, exterior painting.",
  },
  {
    id: "ctr-jp-exterminating",
    name: "JP Exterminating",
    trade: "structural_prep",
    email: "",
    phone: "",
    notes: "Site + container fumigation; provides warranty.",
  },
  {
    id: "ctr-solid-doors",
    name: "Solid Doors / All Screens Doors & Windows",
    trade: "exterior_windows_and_doors",
    email: "",
    phone: "",
    notes: "Exterior windows & doors — manufacture and installation.",
  },
  {
    id: "ctr-henry-mercedes",
    name: "Henry Mercedes / H&G Construction",
    trade: "interior_build",
    email: "",
    phone: "",
    notes: "Interior framing, plumbing, electrical, drywall, painting, bathroom build, foundation.",
  },
  {
    id: "ctr-geraldo-velez",
    name: "Geraldo Velez",
    trade: "electrical",
    email: "",
    phone: "",
    notes: "Electrical infrastructure + electrical finishes.",
  },
  {
    id: "ctr-ar-construction",
    name: "AR Construction PR LLC",
    trade: "kitchen",
    email: "",
    phone: "",
    notes: "Kitchen cabinetry build + installation.",
  },
  {
    id: "ctr-dg-aircon",
    name: "D&G Air Conditioning",
    trade: "hvac",
    email: "",
    phone: "",
    notes: "AC unit installation; HVAC service.",
  },
  {
    id: "ctr-air-max",
    name: "Air Max",
    trade: "hvac",
    email: "",
    phone: "",
    notes: "AC unit purchase + installation alternative.",
  },
  {
    id: "ctr-jose-perez-lisboa",
    name: "Jose Perez Lisboa",
    trade: "foundation",
    email: "",
    phone: "",
    notes: "Foundation engineer; rebar spacing, concrete pour, container mounting plates.",
  },
  {
    id: "ctr-ing-quinones",
    name: "Ing. Carlos Quiñones",
    trade: "structural_prep",
    email: "cquinones@cjqengineering.com",
    phone: "7875294903",
    notes: "Civil engineer / structural designer (Proyectista). License #18892, exp 2028-06-07.",
  },
  {
    id: "ctr-ing-cabiya",
    name: "Ing. Jose Cabiya",
    trade: "site_work",
    email: "geodataambiental@gmail.com",
    phone: "7878712260",
    notes: "Survey & topography. License #9686.",
  },
  {
    id: "ctr-ing-pacheco",
    name: "Ing. Carlos Pacheco",
    trade: "site_plumbing",
    email: "andreac.calvimontes@gmail.com",
    phone: "7877271061",
    notes: "Septic system engineer. License #6593.",
  },
  {
    id: "ctr-ing-mejias",
    name: "Ing. Juan Mejías",
    trade: "site_work",
    email: "jmejias@sfscorp.net",
    phone: "7876755944",
    notes: "Soil engineering / GES study. License #21417, exp 2026-07-07.",
  },
  {
    id: "ctr-ing-aponte",
    name: "Ing. Jose Aponte",
    trade: "site_work",
    email: "",
    phone: "",
    notes: "Inspector. Tracks notable delays + change orders per 2b).",
  },
  {
    id: "ctr-jose-rivera",
    name: "Jose Rivera",
    trade: "foundation",
    email: "",
    phone: "",
    notes: "Site stakeout / foundation prep.",
  },
  {
    id: "ctr-gilberto-feliciano",
    name: "Gilberto Feliciano Mattei",
    trade: "exterior_windows_and_doors",
    email: "",
    phone: "",
    notes: "Windows & doors deposits.",
  },
];

/** Total master row count for sanity-check tests. */
export const MASTER_CONTRACTORS_ROW_COUNT =
  KONTI_INTERNAL_STAKEHOLDERS.length + KONTI_CANONICAL_CONTRACTORS.length;

/**
 * Convert a MasterContractor to the runtime Contractor shape used by the
 * in-memory CONTRACTORS array. Sets `uploadedAt` to a fixed canonical date
 * so the boot migration is idempotent (re-running picks the same id+ts
 * and skips duplicates).
 */
export function masterToContractor(m: MasterContractor): Contractor {
  return {
    id: m.id,
    name: m.name,
    trade: m.trade,
    email: m.email,
    phone: m.phone,
    notes: m.notes,
    uploadedAt: "2026-05-13T00:00:00.000Z",
    uploadedBy: "konti-canonical-seed",
  };
}
