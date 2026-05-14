import type { Request, Response } from "express";
import { PROJECTS } from "../data/seed";

// Returns true if the given client user owns (is mapped to) the project.
function clientCanAccessProject(userId: string, projectId: string): boolean {
  const p = PROJECTS.find((x) => x.id === projectId) as { clientUserId?: string } | undefined;
  return !!p && p.clientUserId === userId;
}

// Shared ownership gate for every client-callable endpoint. When the caller is
// a client, they must own the project or the request is rejected with 403.
// Team/admin/superadmin callers bypass this check (their role gate is already
// enforced by requireRole). Returns true when the request may proceed.
export function enforceClientOwnership(
  req: Request,
  res: Response,
  projectId: string,
): boolean {
  const user = (req as { user?: { id: string; role: string } }).user;
  if (user?.role === "client" && !clientCanAccessProject(user.id, projectId)) {
    res.status(403).json({ error: "forbidden", message: "Client cannot access this project" });
    return false;
  }
  return true;
}
