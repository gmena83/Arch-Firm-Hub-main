import { Router, type IRouter } from "express";
import { AUDIT_LOG, PROJECTS } from "../data/seed";
import { requireRole } from "../middlewares/require-role";

const router: IRouter = Router();

// Admin-only consolidated audit feed across every project / entity.
// Filters: projectId, actor (substring, case-insensitive), entity, from / to
// (ISO date or date-time), limit (default 200, max 1000).
router.get("/audit", requireRole(["admin", "superadmin"]), (req, res) => {
  const projectId = typeof req.query["projectId"] === "string" && req.query["projectId"]
    ? req.query["projectId"]
    : undefined;
  const actorRaw = typeof req.query["actor"] === "string" ? req.query["actor"].trim() : "";
  const actor = actorRaw ? actorRaw.toLowerCase() : undefined;
  const entity = typeof req.query["entity"] === "string" && req.query["entity"]
    ? req.query["entity"]
    : undefined;
  const from = typeof req.query["from"] === "string" && req.query["from"]
    ? req.query["from"]
    : undefined;
  const to = typeof req.query["to"] === "string" && req.query["to"]
    ? req.query["to"]
    : undefined;
  const limitRaw = typeof req.query["limit"] === "string" ? parseInt(req.query["limit"], 10) : 200;
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 1000);

  const fromTs = from ? Date.parse(from) : NaN;
  // If `to` is a bare date (YYYY-MM-DD) treat it as inclusive of the whole day.
  let toTs = to ? Date.parse(to) : NaN;
  if (Number.isFinite(toTs) && to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    toTs = toTs + 24 * 60 * 60 * 1000 - 1;
  }

  const projectMap = new Map(PROJECTS.map((p) => [p.id, p.name]));

  let entries = AUDIT_LOG.slice();
  if (projectId) entries = entries.filter((e) => e.projectId === projectId);
  if (entity) entries = entries.filter((e) => e.entity === entity);
  if (actor) entries = entries.filter((e) => e.actor.toLowerCase().includes(actor));
  if (Number.isFinite(fromTs)) entries = entries.filter((e) => Date.parse(e.timestamp) >= fromTs);
  if (Number.isFinite(toTs)) entries = entries.filter((e) => Date.parse(e.timestamp) <= toTs);

  entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const totalMatching = entries.length;
  entries = entries.slice(0, limit);

  const enriched = entries.map((e) => ({
    ...e,
    projectName: e.projectId ? projectMap.get(e.projectId) : undefined,
  }));

  // Aggregate distinct actors / entities so the filter UI can populate
  // dropdowns without making a second request.
  const actorSet = new Set<string>();
  const entitySet = new Set<string>();
  for (const e of AUDIT_LOG) {
    actorSet.add(e.actor);
    entitySet.add(e.entity);
  }

  res.json({
    total: AUDIT_LOG.length,
    matching: totalMatching,
    returned: enriched.length,
    limit,
    entries: enriched,
    filters: {
      actors: Array.from(actorSet).sort(),
      entities: Array.from(entitySet).sort(),
      projects: PROJECTS.map((p) => ({ id: p.id, name: p.name })),
    },
  });
});

export default router;
