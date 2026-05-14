// L-10 — Augment Express's Request type with the user object that
// `requireRole` populates. Eliminates the repeated `(req as { user?: ...
// }).user` casts that pepper the route handlers, and gives us a single
// source of truth for the user shape.
//
// The actual user record comes from `data/seed.ts → USERS`; we mirror its
// fields here so the rest of the codebase doesn't have to import seed
// just to reference the type.

import type { USERS } from "./data/seed";

declare global {
  namespace Express {
    interface Request {
      /**
       * Set by the `requireRole` middleware after JWT validation. Undefined
       * on unauthenticated routes; never undefined inside a `requireRole`-
       * gated handler.
       */
      user?: typeof USERS[number];
    }
  }
}

// Required when a file is `declare global` only — TypeScript treats files
// without imports/exports as scripts.
export {};
