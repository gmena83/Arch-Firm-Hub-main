// P6.2 — Contractor Monitoring expansion.
//
// Mirrors the 5-section schema in file `2b)_CONTRACTOR_MONITORING_REPORT`:
//   I.   Notable Delays
//   II.  Change Orders
//   III. Climate Conditions
//   IV.  Breach of Contract
//   V.   Corrective Actions
//
// Each contractor row carries a header (startDate, initialFinishDate,
// approvedDelayDays → newFinishDate computed) plus an entries[] list keyed
// by section. Approved-status delays accumulate to extend the finish date.
//
// V1 in-memory; Drizzle persistence queued for Session 4.

import { Router, type IRouter } from "express";
import { PROJECTS, CONTRACTORS } from "../data/seed";
import { requireRole } from "../middlewares/require-role";
import { nextId } from "../lib/id";

const router: IRouter = Router();

export type MonitoringSection =
  | "notable_delays"
  | "change_orders"
  | "climate_conditions"
  | "breach_of_contract"
  | "corrective_actions";

const VALID_SECTIONS: MonitoringSection[] = [
  "notable_delays",
  "change_orders",
  "climate_conditions",
  "breach_of_contract",
  "corrective_actions",
];

export interface MonitoringEntry {
  id: string;
  section: MonitoringSection;
  /** ISO date or date range string. */
  date: string;
  description: string;
  /** "Approved" | "Denied" | "Pending" */
  status: string;
  /** Number of days the delay/extension represents (only meaningful for delays + climate). */
  days?: number;
  notes?: string;
  evidenceLink?: string;
  createdAt: string;
}

export interface ContractorMonitoring {
  projectId: string;
  contractorId: string;
  startDate?: string;
  initialFinishDate?: string;
  approvedDelayDays: number;
  /** Computed: initialFinishDate + approvedDelayDays. Cached but recomputed on PATCH. */
  newFinishDate?: string;
  entries: MonitoringEntry[];
}

// keyed by `${projectId}:${contractorId}`
const PROJECT_CONTRACTOR_MONITORING: Record<string, ContractorMonitoring> = {};

function key(projectId: string, contractorId: string): string {
  return `${projectId}:${contractorId}`;
}

function ensureMonitoring(projectId: string, contractorId: string): ContractorMonitoring {
  const k = key(projectId, contractorId);
  if (!PROJECT_CONTRACTOR_MONITORING[k]) {
    PROJECT_CONTRACTOR_MONITORING[k] = {
      projectId,
      contractorId,
      approvedDelayDays: 0,
      entries: [],
    };
  }
  return PROJECT_CONTRACTOR_MONITORING[k]!;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function recomputeNewFinishDate(m: ContractorMonitoring): void {
  if (m.initialFinishDate && m.approvedDelayDays >= 0) {
    m.newFinishDate = addDays(m.initialFinishDate, m.approvedDelayDays);
  } else {
    m.newFinishDate = undefined;
  }
}

function recomputeApprovedDelays(m: ContractorMonitoring): void {
  // Sum days from Notable Delays + Climate Conditions entries whose status is Approved.
  let total = 0;
  for (const e of m.entries) {
    if (e.status !== "Approved") continue;
    if (e.section !== "notable_delays" && e.section !== "climate_conditions") continue;
    if (typeof e.days === "number" && isFinite(e.days)) total += e.days;
  }
  m.approvedDelayDays = total;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// List every monitoring record for a project (one per contractor).
router.get(
  "/projects/:projectId/contractor-monitoring",
  requireRole(["team", "admin", "superadmin", "architect"]),
  (req, res) => {
    const projectId = req.params["projectId"] as string;
    if (!PROJECTS.find((p) => p.id === projectId)) {
      res.status(404).json({ code: "project_not_found", message: "Project not found", messageEs: "Proyecto no encontrado" });
      return;
    }
    const rows: ContractorMonitoring[] = [];
    for (const [k, v] of Object.entries(PROJECT_CONTRACTOR_MONITORING)) {
      if (k.startsWith(`${projectId}:`)) rows.push(v);
    }
    res.json({ projectId, monitoring: rows });
  },
);

router.get(
  "/projects/:projectId/contractor-monitoring/:contractorId",
  requireRole(["team", "admin", "superadmin", "architect"]),
  (req, res) => {
    const projectId = req.params["projectId"] as string;
    const contractorId = req.params["contractorId"] as string;
    if (!PROJECTS.find((p) => p.id === projectId)) {
      res.status(404).json({ code: "project_not_found", message: "Project not found", messageEs: "Proyecto no encontrado" });
      return;
    }
    if (!CONTRACTORS.find((c) => c.id === contractorId)) {
      res.status(404).json({ code: "contractor_not_found", message: "Contractor not found", messageEs: "Contratista no encontrado" });
      return;
    }
    const m = ensureMonitoring(projectId, contractorId);
    res.json(m);
  },
);

router.patch(
  "/projects/:projectId/contractor-monitoring/:contractorId",
  requireRole(["team", "admin", "superadmin", "architect"]),
  (req, res) => {
    const projectId = req.params["projectId"] as string;
    const contractorId = req.params["contractorId"] as string;
    if (!CONTRACTORS.find((c) => c.id === contractorId)) {
      res.status(404).json({ code: "contractor_not_found", message: "Contractor not found", messageEs: "Contratista no encontrado" });
      return;
    }
    const m = ensureMonitoring(projectId, contractorId);
    const body = (req.body ?? {}) as { startDate?: string; initialFinishDate?: string };
    if (typeof body.startDate === "string") m.startDate = body.startDate.slice(0, 50);
    if (typeof body.initialFinishDate === "string") m.initialFinishDate = body.initialFinishDate.slice(0, 50);
    recomputeNewFinishDate(m);
    res.json(m);
  },
);

router.post(
  "/projects/:projectId/contractor-monitoring/:contractorId/entries",
  requireRole(["team", "admin", "superadmin", "architect"]),
  (req, res) => {
    const projectId = req.params["projectId"] as string;
    const contractorId = req.params["contractorId"] as string;
    const m = ensureMonitoring(projectId, contractorId);
    const body = (req.body ?? {}) as Partial<MonitoringEntry>;
    const section = String(body.section ?? "").toLowerCase() as MonitoringSection;
    if (!VALID_SECTIONS.includes(section)) {
      res.status(400).json({
        code: "bad_section",
        message: `section must be one of ${VALID_SECTIONS.join(", ")}`,
        messageEs: `section debe ser uno de ${VALID_SECTIONS.join(", ")}`,
      });
      return;
    }
    const description = String(body.description ?? "").trim().slice(0, 500);
    if (!description) {
      res.status(400).json({ code: "bad_request", message: "description required", messageEs: "Descripción requerida" });
      return;
    }
    const entry: MonitoringEntry = {
      id: nextId("mon"),
      section,
      date: String(body.date ?? new Date().toISOString().slice(0, 10)).slice(0, 50),
      description,
      status: String(body.status ?? "Pending").slice(0, 30),
      ...(typeof body.days === "number" && isFinite(body.days) ? { days: body.days } : {}),
      ...(typeof body.notes === "string" ? { notes: body.notes.slice(0, 500) } : {}),
      ...(typeof body.evidenceLink === "string" ? { evidenceLink: body.evidenceLink.slice(0, 500) } : {}),
      createdAt: new Date().toISOString(),
    };
    m.entries.push(entry);
    recomputeApprovedDelays(m);
    recomputeNewFinishDate(m);
    res.status(201).json({ entry, monitoring: m });
  },
);

router.patch(
  "/projects/:projectId/contractor-monitoring/:contractorId/entries/:entryId",
  requireRole(["team", "admin", "superadmin", "architect"]),
  (req, res) => {
    const projectId = req.params["projectId"] as string;
    const contractorId = req.params["contractorId"] as string;
    const m = ensureMonitoring(projectId, contractorId);
    const entry = m.entries.find((e) => e.id === req.params["entryId"]);
    if (!entry) {
      res.status(404).json({ code: "not_found", message: "Entry not found", messageEs: "Entrada no encontrada" });
      return;
    }
    const body = (req.body ?? {}) as Partial<MonitoringEntry>;
    if (typeof body.date === "string") entry.date = body.date.slice(0, 50);
    if (typeof body.description === "string") entry.description = body.description.trim().slice(0, 500);
    if (typeof body.status === "string") entry.status = body.status.slice(0, 30);
    if (typeof body.days === "number" && isFinite(body.days)) entry.days = body.days;
    if (typeof body.notes === "string") entry.notes = body.notes.slice(0, 500);
    if (typeof body.evidenceLink === "string") entry.evidenceLink = body.evidenceLink.slice(0, 500);
    recomputeApprovedDelays(m);
    recomputeNewFinishDate(m);
    res.json({ entry, monitoring: m });
  },
);

router.delete(
  "/projects/:projectId/contractor-monitoring/:contractorId/entries/:entryId",
  requireRole(["team", "admin", "superadmin", "architect"]),
  (req, res) => {
    const projectId = req.params["projectId"] as string;
    const contractorId = req.params["contractorId"] as string;
    const m = ensureMonitoring(projectId, contractorId);
    const idx = m.entries.findIndex((e) => e.id === req.params["entryId"]);
    if (idx === -1) {
      res.status(404).json({ code: "not_found", message: "Entry not found", messageEs: "Entrada no encontrada" });
      return;
    }
    m.entries.splice(idx, 1);
    recomputeApprovedDelays(m);
    recomputeNewFinishDate(m);
    res.status(204).end();
  },
);

export default router;
