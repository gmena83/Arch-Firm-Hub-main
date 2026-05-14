import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { PersistFailedError } from "./lib/lifecycle-persistence";
import { apiErrorHandler } from "./middlewares/error-response";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// 25mb body cap accommodates base64-encoded receipt photos / PDFs for OCR
// and the photo-upload data URLs added in #105. Browsers inflate raw bytes
// by ~33% in base64, so the 10MB client-side cap becomes ~13.4MB on the
// wire — comfortably under this limit.
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

// Task #144 — uniform PersistFailedError → 500 persist_failed mapper.
// Any lifecycle-mutating route that awaits a `persist*` helper without a
// local try/catch will land here on commit failure, ensuring the API
// always returns the documented retry contract.
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof PersistFailedError) {
    if (res.headersSent) return next(err);
    return res.status(500).json({
      error: "persist_failed",
      message: err.userMessage,
      messageEs: err.userMessageEs,
    });
  }
  return next(err);
});

// M-8 — Canonical error-response middleware. Place LAST so it catches
// anything that fell through the persist handler above. Returns the
// documented `{ code, message, messageEs, details? }` shape for ApiError
// throws and a sanitized 500 for unknown errors.
app.use(apiErrorHandler);

export default app;
