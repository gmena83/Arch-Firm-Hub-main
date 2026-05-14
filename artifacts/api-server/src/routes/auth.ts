import { Router, type IRouter } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { USERS, PROJECTS } from "../data/seed";
import { userFromAuthHeader } from "../middlewares/require-role";
import { appendActivityAndPersist, persistUserProfile } from "../lib/lifecycle-persistence";

const router: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "bad_request", message: "Email and password are required" });
    return;
  }

  const user = USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());

  const passwordValid = user ? await bcrypt.compare(password, user.password) : false;

  if (!user || !passwordValid) {
    res.status(401).json({ error: "unauthorized", message: "Invalid email or password" });
    return;
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  const { password: _pw, ...safeUser } = user;

  res.json({ token, user: safeUser });
});

// Refresh the authenticated user (used by the dashboard after PATCH /me to
// re-hydrate localStorage with the latest contact fields).
router.get("/me", async (req, res) => {
  const user = userFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: "unauthorized", message: "Authentication required" });
    return;
  }
  const { password: _pw, ...safeUser } = user;
  res.json(safeUser);
});

// Update the authenticated user's editable contact fields. For client users
// every owned project receives a `profile_update` activity entry so the team
// can see the change in the project timeline (T5 audit prep).
router.patch("/me", async (req, res) => {
  const user = userFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ error: "unauthorized", message: "Authentication required" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;

  const updates: { phone?: string; postalAddress?: string; physicalAddress?: string } = {};
  const changedKeys: string[] = [];
  const trim = (raw: unknown): string | undefined => (typeof raw === "string" ? raw.trim() : undefined);

  const phone = trim(body["phone"]);
  if (phone !== undefined) updates.phone = phone;
  const postalAddress = trim(body["postalAddress"]);
  if (postalAddress !== undefined) updates.postalAddress = postalAddress;
  const physicalAddress = trim(body["physicalAddress"]);
  if (physicalAddress !== undefined) updates.physicalAddress = physicalAddress;

  for (const key of ["phone", "postalAddress", "physicalAddress"] as const) {
    if (updates[key] !== undefined && updates[key] !== user[key]) {
      user[key] = updates[key];
      changedKeys.push(key);
    }
  }

  // Durability: persist the profile row before recording per-project activities
  // so a crash-after-ack cannot lose the user-visible profile change.
  if (changedKeys.length > 0) {
    try { await persistUserProfile(user.id); }
    catch {
      res.status(500).json({ error: "persist_failed", message: "Profile edits were applied in memory but failed to save. Please retry." });
      return;
    }
  }

  if (changedKeys.length > 0 && user.role === "client") {
    const labelEn: Record<string, string> = {
      phone: "phone",
      postalAddress: "postal address",
      physicalAddress: "physical address",
    };
    const labelEs: Record<string, string> = {
      phone: "teléfono",
      postalAddress: "dirección postal",
      physicalAddress: "dirección física",
    };
    const fieldsEn = changedKeys.map((k) => labelEn[k]).join(", ");
    const fieldsEs = changedKeys.map((k) => labelEs[k]).join(", ");
    for (const project of PROJECTS as Array<{ id: string; clientUserId?: string }>) {
      if (project.clientUserId === user.id) {
        await appendActivityAndPersist(project.id, {
          type: "profile_update",
          actor: user.name,
          description: `Client updated their ${fieldsEn}.`,
          descriptionEs: `El cliente actualizó su ${fieldsEs}.`,
        });
      }
    }
  }

  const { password: _pw, ...safeUser } = user;
  res.json(safeUser);
});

export default router;
