// M-8 — Centralized error response shape.
//
// Per the meeting's "estandarización de mensajes de error" goal AND
// CODEBASE_FINDINGS.md M-8: every error response now ships
// `{ code, message, messageEs, details? }`. The dashboard can render a
// single bilingual toast component for any failure.
//
// Existing routes that emit `res.status(...).json({ error: "..." })`
// continue to work — this middleware doesn't intercept those. The point
// is that NEW code (and refactors) have a single source of truth.
//
// Usage:
//
//   import { sendError } from "../middlewares/error-response";
//
//   if (!project) return sendError(res, 404, "project_not_found", "Project not found", "Proyecto no encontrado");
//
// For thrown errors (route handler propagates), wire `apiErrorHandler`
// last in `app.ts` so any uncaught error lands in the canonical shape.

import type { Request, Response, NextFunction } from "express";
import { PersistFailedError } from "../lib/lifecycle-persistence";

export interface ApiErrorBody {
  code: string;
  message: string;
  messageEs: string;
  details?: Record<string, unknown>;
}

/**
 * Sentinel class for throwing typed API errors from route handlers.
 * The downstream apiErrorHandler middleware unwraps these to the
 * canonical JSON shape with the documented status code.
 */
export class ApiError extends Error {
  status: number;
  code: string;
  messageEs: string;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    messageEs: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.messageEs = messageEs;
    if (details) this.details = details;
  }
}

/** Direct send helper for routes that don't throw. */
export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  messageEs: string,
  details?: Record<string, unknown>,
): Response {
  const body: ApiErrorBody = { code, message, messageEs };
  if (details) body.details = details;
  return res.status(status).json(body);
}

/**
 * Express error-handling middleware. Place last in `app.ts` (after the
 * existing PersistFailedError handler). Catches:
 *   - ApiError                → uses its own status + body
 *   - PersistFailedError      → 500 persist_failed (kept for back-compat,
 *                               the existing handler in app.ts catches it
 *                               first, but this is the fallback)
 *   - Anything else           → 500 internal_error (sanitized)
 */
export function apiErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof ApiError) {
    const body: ApiErrorBody = {
      code: err.code,
      message: err.message,
      messageEs: err.messageEs,
    };
    if (err.details) body.details = err.details;
    res.status(err.status).json(body);
    return;
  }
  if (err instanceof PersistFailedError) {
    res.status(500).json({
      code: "persist_failed",
      message: err.userMessage,
      messageEs: err.userMessageEs,
    } satisfies ApiErrorBody);
    return;
  }
  // Unknown error — log details server-side, return generic to the client.
  // The error itself is NOT included in the response to avoid leaking
  // stack traces / DB internals.
  // eslint-disable-next-line no-console
  console.error("[apiErrorHandler] unhandled error:", err);
  res.status(500).json({
    code: "internal_error",
    message: "An unexpected error occurred. Please retry.",
    messageEs: "Ocurrió un error inesperado. Por favor reintente.",
  } satisfies ApiErrorBody);
}
