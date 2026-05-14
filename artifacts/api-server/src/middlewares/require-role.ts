import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { USERS } from "../data/seed";

// P4.3 — `field_admin` joins the role enum as the meeting-defined validator
// role (Jorge). Sits between `team` and `admin`:
//   - team:        regular contributor; can add to a project's calculator
//                  but not to the master catalog.
//   - field_admin: can create new master materials, new contractor records,
//                  and new categories. Does NOT have superadmin powers
//                  (key rotation, billing settings, role grants).
//   - admin:       full project + lifecycle authority.
//   - superadmin:  platform-level (integrations, role grants).
type Role = "admin" | "architect" | "client" | "superadmin" | "team" | "field_admin";

export type AuthedRequest = Request & { user?: typeof USERS[number] };

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

export function userFromAuthHeader(req: Request): typeof USERS[number] | undefined {
  const header = req.headers["authorization"];
  if (typeof header !== "string") return undefined;
  if (!header.startsWith("Bearer ")) return undefined;
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub?: string };
    if (typeof payload.sub !== "string") return undefined;
    return USERS.find((u) => u.id === payload.sub);
  } catch {
    return undefined;
  }
}

// Map "team" role alias to all internal team-member roles.
function expandRoles(roles: Role[]): Role[] {
  const expanded = new Set<Role>(roles);
  if (expanded.has("team")) {
    expanded.add("admin");
    expanded.add("architect");
    expanded.add("superadmin");
  }
  return Array.from(expanded);
}

export function requireRole(roles: Role[] | Role, ..._rest: Role[]) {
  const roleList = expandRoles(Array.isArray(roles) ? roles : [roles, ..._rest]);
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = userFromAuthHeader(req);
    if (!user) {
      res.status(401).json({ error: "unauthorized", message: "Authentication required" });
      return;
    }
    if (!roleList.includes(user.role as Role)) {
      res.status(403).json({ error: "forbidden", message: "Insufficient permissions" });
      return;
    }
    (req as AuthedRequest).user = user;
    next();
  };
}
