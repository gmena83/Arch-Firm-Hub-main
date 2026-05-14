import { Router, type IRouter } from "express";
import { CONTRACTORS, appendAuditEntry, type Contractor } from "../data/seed";
import { requireRole } from "../middlewares/require-role";
import { nextId } from "../lib/id";

const router: IRouter = Router();

function newContractorId(): string {
  // C-4: replace the legacy `Date.now() + Math.random()` generator with
  // the centralized crypto.randomUUID()-backed helper.
  return nextId("ctr");
}

function sanitize(input: unknown, max = 500): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, max);
}

router.get(
  "/contractors",
  requireRole(["admin", "superadmin", "architect", "team"]),
  (_req, res) => {
    const sorted = [...CONTRACTORS].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    res.json(sorted);
  },
);

router.post(
  "/contractors",
  requireRole(["admin", "superadmin", "architect"]),
  (req, res): void => {
    const body = req.body ?? {};
    const single = body && typeof body === "object" && !Array.isArray(body.contractors);
    const incoming: unknown[] = single ? [body] : Array.isArray(body.contractors) ? body.contractors : [];
    if (incoming.length === 0) {
      res.status(400).json({ error: "Provide a contractor object or { contractors: [...] }." });
      return;
    }
    const authUser = (req as { user?: { email?: string; name?: string; id?: string; role?: string } }).user;
    const userEmail = authUser?.email ?? "system";
    const actorName = authUser?.name ?? authUser?.email ?? "system";
    const created: Contractor[] = [];
    const errors: { index: number; reason: string }[] = [];
    incoming.forEach((raw, i) => {
      if (!raw || typeof raw !== "object") {
        errors.push({ index: i, reason: "Row is not an object." });
        return;
      }
      const r = raw as Record<string, unknown>;
      const name = sanitize(r.name, 120);
      const trade = sanitize(r.trade, 120);
      if (!name || !trade) {
        errors.push({ index: i, reason: "Name and trade are required." });
        return;
      }
      const c: Contractor = {
        id: newContractorId(),
        name,
        trade,
        email: sanitize(r.email, 200),
        phone: sanitize(r.phone, 60),
        notes: sanitize(r.notes, 1000),
        uploadedAt: new Date().toISOString(),
        uploadedBy: userEmail,
      };
      CONTRACTORS.push(c);
      created.push(c);
      appendAuditEntry({
        actor: actorName,
        ...(authUser?.id !== undefined ? { actorId: authUser.id } : {}),
        ...(authUser?.role !== undefined ? { actorRole: authUser.role } : {}),
        entity: "contractor",
        entityId: c.id,
        type: "contractor_created",
        description: `Contractor "${c.name}" (${c.trade}) added`,
        descriptionEs: `Contratista "${c.name}" (${c.trade}) agregado`,
      });
    });
    if (created.length === 0) {
      res.status(400).json({ error: "No valid contractors in payload.", details: errors });
      return;
    }
    res.status(201).json({ created, skipped: errors });
  },
);

router.delete(
  "/contractors/:id",
  requireRole(["admin", "superadmin", "architect"]),
  (req, res): void => {
    const idx = CONTRACTORS.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Contractor not found." });
      return;
    }
    const [removed] = CONTRACTORS.splice(idx, 1);
    if (removed) {
      const authUser = (req as { user?: { id?: string; name?: string; email?: string; role?: string } }).user;
      appendAuditEntry({
        actor: authUser?.name ?? authUser?.email ?? "system",
        ...(authUser?.id !== undefined ? { actorId: authUser.id } : {}),
        ...(authUser?.role !== undefined ? { actorRole: authUser.role } : {}),
        entity: "contractor",
        entityId: removed.id,
        type: "contractor_deleted",
        description: `Contractor "${removed.name}" (${removed.trade}) removed`,
        descriptionEs: `Contratista "${removed.name}" (${removed.trade}) eliminado`,
      });
    }
    res.json(removed);
  },
);

export default router;
