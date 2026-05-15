import app from "./app";
import { logger } from "./lib/logger";
import { installAsanaSync } from "./lib/asana-sync";
import { ensureEstimatingHydrated } from "./routes/estimating";
import { ensureCalculatorHydrated } from "./routes/projects";
import { ensureLifecycleHydrated } from "./lib/lifecycle-persistence";
import { migrateCanonicalContractorsIfNeeded } from "./lib/canonical-contractors-seed";

// Wire the optional Asana sync hook (Task #127). Stays a noop until an admin
// connects the Asana workspace in Settings → Integrations.
installAsanaSync();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Boot sequence (Task #141): hydrate the estimating + calculator stores from
// Postgres BEFORE accepting traffic. The hydrate step also runs the one-time
// JSON → Postgres migration.
//
// Failure policy:
//   - In production we FAIL FAST (process.exit(1)) so the deploy platform
//     restarts us rather than serve traffic from seed defaults — that
//     would be the exact silent-data-loss footgun this task was supposed
//     to eliminate. Postgres unreachable at boot is a real outage, not
//     something to paper over with degraded reads.
//   - In dev / test we log and continue serving so a developer working
//     without the DB up isn't blocked from iterating on unrelated
//     routes. Tests also rely on this path because they sometimes set
//     up fixtures after `app` is constructed.
async function bootstrap(): Promise<void> {
  try {
    await Promise.all([
      ensureEstimatingHydrated(),
      ensureCalculatorHydrated(),
      ensureLifecycleHydrated(),
    ]);
    // P4.5 — Idempotent canonical contractor seed. Runs after lifecycle
    // hydration so it operates on the already-loaded CONTRACTORS array.
    await migrateCanonicalContractorsIfNeeded();
  } catch (err) {
    // Surface err.message + code in the plain-text message so Railway's
    // log viewer shows the actual cause even when it crops structured
    // objects. The structured `{ err }` is still emitted for tools that
    // can read JSON.
    const errMsg = err instanceof Error ? err.message : String(err);
    const errCode = (err as { code?: string })?.code ?? "no_code";
    logger.error({ err }, `Estimating/calculator/lifecycle hydration failed at boot — ${errCode}: ${errMsg}`);
    if (process.env["NODE_ENV"] === "production") {
      logger.error("Refusing to serve traffic in production with stale state — exiting for restart.");
      process.exit(1);
    }
    // dev/test: continue with whatever is in memory + the seed defaults.
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "Fatal error during bootstrap");
  process.exit(1);
});
