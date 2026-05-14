// P6.1 — Permits Checklist module.
//
// Mirrors the structure of file `1a) Permits Checklist Template 2.0.xlsx`
// (Benito Colon variant). Per the 2026-05-11 meeting, this was a major
// daily-touched KONTi workflow that lived entirely in Excel — now a first-
// class platform surface.
//
// Each project carries four permit checklists keyed by type:
//   - PCOC: Permiso de Construcción (Construction)
//   - PUS:  Permiso de Uso (Use)
//   - DEA:  Determinación de Ámbito
//   - REA:  Recomendación de Endoso Ambiental
// Plus a General Information form (zoning, OGPE, catastro) and an Engineer
// Info list (Proyectista, Structural, Survey, Septic, Soil).
//
// V1 stores everything in memory (matching the rest of the unmigrated state).
// Drizzle persistence is queued for Session 4 polish.

import { Router, type IRouter } from "express";
import { PROJECTS } from "../data/seed";
import { requireRole } from "../middlewares/require-role";
import { enforceClientOwnership } from "../middlewares/client-ownership";
import { nextId } from "../lib/id";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export type PermitType = "PCOC" | "PUS" | "DEA" | "REA";
const PERMIT_TYPES: PermitType[] = ["PCOC", "PUS", "DEA", "REA"];

export interface PermitChecklistItem {
  id: string;
  description: string;
  comments?: string;
  docFilledOut: boolean;
  sent: boolean;
  received: boolean;
  fileUploadLink?: string;
}

export interface PermitChecklist {
  projectId: string;
  permitType: PermitType;
  startedAt?: string;
  completedAt?: string;
  items: PermitChecklistItem[];
}

export interface PermitEngineer {
  id: string;
  role: string;       // "Proyectista" | "Structural" | "Survey" | "Septic" | "Soil Study" | "Other"
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  specialty?: string;
  licenseNumber?: string;
  licenseExpDate?: string;
  discipline?: string;
}

export interface PermitGeneralInfo {
  projectId: string;
  projectName?: string;
  addressOfWork?: string;
  permitCompletedBy?: string;
  catastroNumber?: string;
  ogpeNumber?: string;
  zoning?: string;
  clientName?: string;
  coordinates?: string;
  model?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  constructionCost?: number;
  totalCapacity?: number;
  totalSquareFootage?: number;
  principalUse?: string;
  typeOfResidence?: string;
  typeOfStructure?: string;
  potableWaterSupply?: string;
  sewageDisposal?: string;
  quantityOfStructures?: number;
  // Multi-select existing infrastructure (Acueductos, Electricidad AEE, etc.)
  existingInfrastructure?: string[];
  structureMaterial?: string;
  engineers?: PermitEngineer[];
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

const PROJECT_PERMIT_GENERAL: Record<string, PermitGeneralInfo> = {};
// keyed by `${projectId}:${permitType}`
const PROJECT_PERMIT_CHECKLISTS: Record<string, PermitChecklist> = {};

// Canonical PCOC rows from file `1a)` PCOC sheet rows 13-30. The team's
// "starting set" for every new project. The list is intentionally short
// here — additional rows are added per-project as needed.
const CANONICAL_PCOC_ROWS = [
  "Deed or Property Title or Lease Agreement",
  "Photograph of the property",
  "Authorization of the owner of the project",
  "Explanatory memorandum",
  "GES Report / Soil study",
  "Certification for percolation of land",
  "CRIM certification (indicating the catastro number)",
  "Certification of graphic file, official map",
  "Digital plan, in polygon, of project measurements",
  "Designer's certification (Proyectista)",
  "Evidence of designer's licenses",
  "Specialist certification — Structural (Quiñones)",
  "Specialist certification — Survey (Cabiya)",
  "Specialist certification — Inspector (Aponte)",
  "Specialist certification — Soil/GES (Mejías)",
  "Evidence of specialist licenses",
] as const;

const CANONICAL_PUS_ROWS = [
  "Inspector Certification",
  "Final Inspection Report",
  "Photo evidence — completed structure",
] as const;

const CANONICAL_DEA_ROWS = [
  "Determinación de Ámbito application",
  "Site plan submitted",
  "Environmental questionnaire",
] as const;

const CANONICAL_REA_ROWS = [
  "Recomendación de Endoso Ambiental application",
  "Environmental impact summary",
  "Conservation area review",
] as const;

function canonicalRowsFor(type: PermitType): readonly string[] {
  switch (type) {
    case "PCOC": return CANONICAL_PCOC_ROWS;
    case "PUS":  return CANONICAL_PUS_ROWS;
    case "DEA":  return CANONICAL_DEA_ROWS;
    case "REA":  return CANONICAL_REA_ROWS;
  }
}

function ensureChecklist(projectId: string, type: PermitType): PermitChecklist {
  const key = `${projectId}:${type}`;
  if (!PROJECT_PERMIT_CHECKLISTS[key]) {
    PROJECT_PERMIT_CHECKLISTS[key] = {
      projectId,
      permitType: type,
      items: canonicalRowsFor(type).map((d) => ({
        id: nextId("pchk"),
        description: d,
        docFilledOut: false,
        sent: false,
        received: false,
      })),
    };
  }
  return PROJECT_PERMIT_CHECKLISTS[key]!;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get(
  "/projects/:projectId/permits/general",
  requireRole(["team", "admin", "superadmin", "architect", "client"]),
  (req, res) => {
    const projectId = req.params["projectId"] as string;
    if (!enforceClientOwnership(req, res, projectId)) return;
    if (!PROJECTS.find((p) => p.id === projectId)) {
      res.status(404).json({ code: "project_not_found", message: "Project not found", messageEs: "Proyecto no encontrado" });
      return;
    }
    const info = PROJECT_PERMIT_GENERAL[projectId] ?? { projectId };
    res.json(info);
  },
);

router.patch(
  "/projects/:projectId/permits/general",
  requireRole(["team", "admin", "superadmin", "architect"]),
  (req, res) => {
    const projectId = req.params["projectId"] as string;
    if (!PROJECTS.find((p) => p.id === projectId)) {
      res.status(404).json({ code: "project_not_found", message: "Project not found", messageEs: "Proyecto no encontrado" });
      return;
    }
    const body = (req.body ?? {}) as Partial<PermitGeneralInfo>;
    const current = PROJECT_PERMIT_GENERAL[projectId] ?? { projectId };
    // Whitelist + sanitize each known field. Unknown keys ignored.
    const next: PermitGeneralInfo = {
      ...current,
      projectId,
      updatedAt: new Date().toISOString(),
    };
    const stringFields = [
      "projectName", "addressOfWork", "permitCompletedBy", "catastroNumber",
      "ogpeNumber", "zoning", "clientName", "coordinates", "model", "city",
      "state", "zipCode", "principalUse", "typeOfResidence", "typeOfStructure",
      "potableWaterSupply", "sewageDisposal", "structureMaterial",
    ] as const;
    // Cast through `unknown` because PermitGeneralInfo is a typed shape, not
    // an open record — the writes below are intentional and the field list
    // is whitelisted above.
    const nextRec = next as unknown as Record<string, unknown>;
    const bodyRec = body as unknown as Record<string, unknown>;
    for (const f of stringFields) {
      const v = bodyRec[f];
      if (typeof v === "string") nextRec[f] = v.slice(0, 500);
    }
    if (typeof body.constructionCost === "number" && isFinite(body.constructionCost)) {
      next.constructionCost = body.constructionCost;
    }
    if (typeof body.totalCapacity === "number" && isFinite(body.totalCapacity)) {
      next.totalCapacity = body.totalCapacity;
    }
    if (typeof body.totalSquareFootage === "number" && isFinite(body.totalSquareFootage)) {
      next.totalSquareFootage = body.totalSquareFootage;
    }
    if (typeof body.quantityOfStructures === "number" && isFinite(body.quantityOfStructures)) {
      next.quantityOfStructures = body.quantityOfStructures;
    }
    if (Array.isArray(body.existingInfrastructure)) {
      next.existingInfrastructure = (body.existingInfrastructure as unknown[])
        .filter((s) => typeof s === "string")
        .map((s) => (s as string).slice(0, 100))
        .slice(0, 20);
    }
    if (Array.isArray(body.engineers)) {
      next.engineers = (body.engineers as unknown[])
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .map((raw) => ({
          id: typeof raw["id"] === "string" ? raw["id"] : nextId("eng"),
          role: String(raw["role"] ?? "Other").slice(0, 60),
          name: String(raw["name"] ?? "").slice(0, 200),
          ...(typeof raw["address"] === "string" ? { address: raw["address"].slice(0, 300) } : {}),
          ...(typeof raw["phone"] === "string" ? { phone: raw["phone"].slice(0, 50) } : {}),
          ...(typeof raw["email"] === "string" ? { email: raw["email"].slice(0, 200) } : {}),
          ...(typeof raw["specialty"] === "string" ? { specialty: raw["specialty"].slice(0, 200) } : {}),
          ...(typeof raw["licenseNumber"] === "string" ? { licenseNumber: raw["licenseNumber"].slice(0, 100) } : {}),
          ...(typeof raw["licenseExpDate"] === "string" ? { licenseExpDate: raw["licenseExpDate"].slice(0, 50) } : {}),
          ...(typeof raw["discipline"] === "string" ? { discipline: raw["discipline"].slice(0, 200) } : {}),
        }))
        .slice(0, 30);
    }
    PROJECT_PERMIT_GENERAL[projectId] = next;
    res.json(next);
  },
);

router.get(
  "/projects/:projectId/permits/:permitType",
  requireRole(["team", "admin", "superadmin", "architect", "client"]),
  (req, res) => {
    const projectId = req.params["projectId"] as string;
    if (!enforceClientOwnership(req, res, projectId)) return;
    const rawPermit = req.params["permitType"];
    const permitType = (typeof rawPermit === "string" ? rawPermit : "").toUpperCase() as PermitType;
    if (!PERMIT_TYPES.includes(permitType)) {
      res.status(400).json({ code: "bad_permit_type", message: "Permit type must be PCOC, PUS, DEA, or REA.", messageEs: "Tipo de permiso debe ser PCOC, PUS, DEA o REA." });
      return;
    }
    if (!PROJECTS.find((p) => p.id === projectId)) {
      res.status(404).json({ code: "project_not_found", message: "Project not found", messageEs: "Proyecto no encontrado" });
      return;
    }
    const checklist = ensureChecklist(projectId, permitType);
    res.json(checklist);
  },
);

router.patch(
  "/projects/:projectId/permits/:permitType/items/:itemId",
  requireRole(["team", "admin", "superadmin", "architect"]),
  (req, res) => {
    const projectId = req.params["projectId"] as string;
    const rawPermit = req.params["permitType"];
    const permitType = (typeof rawPermit === "string" ? rawPermit : "").toUpperCase() as PermitType;
    if (!PERMIT_TYPES.includes(permitType)) {
      res.status(400).json({ code: "bad_permit_type", message: "Bad permit type", messageEs: "Tipo de permiso inválido" });
      return;
    }
    if (!PROJECTS.find((p) => p.id === projectId)) {
      res.status(404).json({ code: "project_not_found", message: "Project not found", messageEs: "Proyecto no encontrado" });
      return;
    }
    const checklist = ensureChecklist(projectId, permitType);
    const item = checklist.items.find((i) => i.id === req.params["itemId"]);
    if (!item) {
      res.status(404).json({ code: "not_found", message: "Checklist item not found", messageEs: "Ítem no encontrado" });
      return;
    }
    const body = (req.body ?? {}) as Partial<PermitChecklistItem>;
    if (typeof body.docFilledOut === "boolean") item.docFilledOut = body.docFilledOut;
    if (typeof body.sent === "boolean") item.sent = body.sent;
    if (typeof body.received === "boolean") item.received = body.received;
    if (typeof body.comments === "string") item.comments = body.comments.slice(0, 500);
    if (typeof body.fileUploadLink === "string") item.fileUploadLink = body.fileUploadLink.slice(0, 500);
    if (typeof body.description === "string" && body.description.trim().length > 0) {
      item.description = body.description.trim().slice(0, 300);
    }
    res.json(item);
  },
);

router.post(
  "/projects/:projectId/permits/:permitType/items",
  requireRole(["team", "admin", "superadmin", "architect"]),
  (req, res) => {
    const projectId = req.params["projectId"] as string;
    const rawPermit = req.params["permitType"];
    const permitType = (typeof rawPermit === "string" ? rawPermit : "").toUpperCase() as PermitType;
    if (!PERMIT_TYPES.includes(permitType)) {
      res.status(400).json({ code: "bad_permit_type", message: "Bad permit type", messageEs: "Tipo de permiso inválido" });
      return;
    }
    if (!PROJECTS.find((p) => p.id === projectId)) {
      res.status(404).json({ code: "project_not_found", message: "Project not found", messageEs: "Proyecto no encontrado" });
      return;
    }
    const body = (req.body ?? {}) as { description?: string; comments?: string };
    const description = String(body.description ?? "").trim().slice(0, 300);
    if (!description) {
      res.status(400).json({ code: "bad_request", message: "description required", messageEs: "Descripción requerida" });
      return;
    }
    const checklist = ensureChecklist(projectId, permitType);
    const item: PermitChecklistItem = {
      id: nextId("pchk"),
      description,
      comments: body.comments ? String(body.comments).slice(0, 500) : undefined,
      docFilledOut: false,
      sent: false,
      received: false,
    };
    checklist.items.push(item);
    res.status(201).json(item);
  },
);

router.delete(
  "/projects/:projectId/permits/:permitType/items/:itemId",
  requireRole(["team", "admin", "superadmin", "architect"]),
  (req, res) => {
    const projectId = req.params["projectId"] as string;
    const rawPermit = req.params["permitType"];
    const permitType = (typeof rawPermit === "string" ? rawPermit : "").toUpperCase() as PermitType;
    if (!PERMIT_TYPES.includes(permitType)) {
      res.status(400).json({ code: "bad_permit_type", message: "Bad permit type", messageEs: "Tipo de permiso inválido" });
      return;
    }
    const checklist = ensureChecklist(projectId, permitType);
    const idx = checklist.items.findIndex((i) => i.id === req.params["itemId"]);
    if (idx === -1) {
      res.status(404).json({ code: "not_found", message: "Item not found", messageEs: "Ítem no encontrado" });
      return;
    }
    checklist.items.splice(idx, 1);
    res.status(204).end();
  },
);

export default router;
