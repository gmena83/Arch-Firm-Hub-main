# KONTi Dashboard — Deployment Guide

This is the cutover playbook for moving the KONTi Dashboard from Replit to production on **Vercel + Railway + Neon**.

> **TL;DR for the impatient:**
>
> 1. Push the repo to GitHub.
> 2. Provision **Neon Postgres** → grab the pooled `DATABASE_URL`.
> 3. Deploy `api-server` to **Railway**, paste `DATABASE_URL` + every secret from [.env.example](./.env.example).
> 4. Deploy `konti-dashboard` to **Vercel**, paste your Railway URL into `vercel.json`'s rewrite + set `VITE_API_BASE_URL` env-var.
> 5. Run the one-time Drizzle migration: `pnpm --filter @workspace/db run db:push`.
> 6. Smoke-test: lead intake → accept → calculator → site visit → report.

---

## Architecture

| Component | Platform | Why |
|-----------|----------|-----|
| `konti-dashboard` (Vite SPA) | **Vercel** | Industry-standard for Vite. Zero-config GitHub auto-deploys. Free tier covers the trial (100 GB bandwidth / mo). |
| `api-server` (Express + Drizzle + queues) | **Railway** | Long-running Node process. Same model as Replit but cheaper + faster builds. $5/mo Developer plan. Supports persistence queues, Whisper background jobs, Asana/Drive sync, 10 MB uploads — all of which break under Vercel serverless. |
| Postgres | **Neon** | Built-in connection pooler. Free tier: 0.5 GB storage (fine for trial). |

**Why NOT all-Vercel?**
- `setImmediate` queues in `lifecycle-persistence.ts` don't survive serverless cold starts.
- AI streaming (`Readable.fromWeb(...).pipe(res)`) exceeds Vercel hobby's 10s function timeout.
- 10 MB photo uploads exceed Vercel's default 4.5 MB body limit on hobby.
- Asana/Drive sync uses in-process timers — these die between invocations.

---

## Step 1 — GitHub repo

The repo is a pnpm workspace monorepo. From the project root:

```bash
git init -b main
git add -A
git commit -m "Initial KONTi Dashboard import"
gh repo create konti-dashboard --private --source=. --push
```

If you don't have `gh`, create the repo on github.com first and push manually:

```bash
git remote add origin https://github.com/YOUR-ORG/konti-dashboard.git
git push -u origin main
```

---

## Step 2 — Neon Postgres

1. Sign up at [neon.tech](https://neon.tech).
2. Create a new project named `konti-prod` in the `us-east-2` (Ohio) region — closest to Puerto Rico latency-wise.
3. Open the project → **Connection Details** → copy the **Pooled connection** string. It looks like:
   ```
   postgresql://user:pwd@ep-xxx-pooler.us-east-2.aws.neon.tech/konti?sslmode=require
   ```
   Use the **pooled** variant (URL contains `-pooler`). Drizzle's `pg` driver works fine with PgBouncer transaction mode.
4. Keep this string handy — you'll paste it into Railway as `DATABASE_URL`.

---

## Step 3 — Drizzle schema migration

The schema lives in [lib/db/src/schema/](./lib/db/src/schema/) and is driven by Drizzle. From the project root:

```bash
# Generate the SQL migration files from the TypeScript schemas
pnpm --filter @workspace/db run db:generate

# Apply them to Neon
DATABASE_URL='postgresql://...your-pooled-string...' \
  pnpm --filter @workspace/db run db:push
```

If `db:push` isn't defined yet (depends on `lib/db/package.json`), use `db:migrate` or run `drizzle-kit push` directly:

```bash
DATABASE_URL='postgresql://...' npx drizzle-kit push --config=lib/db/drizzle.config.ts
```

**One-time seed migration** runs automatically on the api-server's first boot — it imports the in-memory seed data into Postgres. See `lifecycle-persistence.ts → migrateLifecycleSeedIfNeeded()`. Idempotency key: `lifecycle-seed-2026-05`.

---

## Step 4 — Railway deploy (api-server)

1. Sign up at [railway.app](https://railway.app).
2. **New Project → Deploy from GitHub repo** → pick `konti-dashboard`.
3. Railway will detect `railway.json` and use Nixpacks to build. The build runs:
   ```
   pnpm install --frozen-lockfile && pnpm --filter @workspace/api-spec --filter @workspace/db ... run build && pnpm --filter @workspace/api-server run build
   ```
4. **Environment variables** — copy from [.env.example](./.env.example):
   - `NODE_ENV=production`
   - `JWT_SECRET=` *(48 random bytes, base64; never share)*
   - `DATABASE_URL=` *(your Neon pooled string)*
   - `ANTHROPIC_API_KEY=`
   - `OPENAI_API_KEY=`
   - `PDF_CO_API_KEY=`
   - `RESEND_API_KEY=` + `MAIL_FROM=`
   - `LOG_LEVEL=info`
   - `DASHBOARD_BASE_URL=` *(your Vercel URL — paste after Step 5)*
5. Generate a public domain (Railway → Settings → Networking → Generate Domain). Copy the URL.
6. Health check: `https://your-app.up.railway.app/api/health` should return 200.

---

## Step 5 — Vercel deploy (dashboard)

1. Sign up at [vercel.com](https://vercel.com).
2. **Add New → Project → Import Git Repository** → pick your repo.
3. **Framework Preset:** Other (the config lives in `vercel.json`).
4. **Edit `vercel.json`** — replace the placeholder Railway URL in the rewrite:
   ```json
   {
     "source": "/api/:path*",
     "destination": "https://YOUR-RAILWAY-API.up.railway.app/api/:path*"
   }
   ```
   Commit + push. Vercel will redeploy.
5. **Environment variables** (Vercel project settings):
   - *(none strictly required for the SPA — the rewrite handles the API URL)*
6. Vercel assigns a URL like `konti-dashboard-xxx.vercel.app`. Copy it.
7. Go back to Railway → set `DASHBOARD_BASE_URL=https://konti-dashboard-xxx.vercel.app`. Railway will redeploy.

---

## Step 6 — Smoke test

The five-step happy path that exercises every major code path:

1. **Lead intake:** visit `https://your-vercel-url/intake` → submit a fake lead → verify a notification arrives.
2. **Accept lead:** log in as `admin` → `/leads` → Accept → confirm a project is synthesized with the canonical materials list seeded.
3. **Calculator:** open the project → calculator page → adjust container count → confirm quantities multiply.
4. **Site visit:** start a site visit → record a 10-second audio clip → confirm Whisper transcript appears within 30s.
5. **Report:** open the client report → preview PDF → confirm the saved template renders + photos appear.

If any step fails, check:
- Railway logs (`railway logs`) for server errors.
- Vercel build logs for SPA bundling issues.
- Neon's `Monitoring` tab for connection pool saturation.

---

## Step 7 — Custom domain (optional)

When KONTi is ready to point `app.konti.com` at the dashboard:

1. Vercel → project → **Settings → Domains** → add `app.konti.com`.
2. KONTi's DNS provider: add the CNAME record Vercel shows you.
3. Update `DASHBOARD_BASE_URL` on Railway → redeploy.

---

## Deployment mode decision (P8.3)

Per the SESSION_BREAKDOWN.md plan: after 4 weeks of trial data, decide between:

| Mode | Cost | Cold-start latency | Recommendation |
|------|-----:|-------------------:|----------------|
| **Railway Developer** | ~$5/mo | None (always-on) | **Default for the trial.** |
| Vercel + Railway Pro | ~$25/mo | None | Upgrade only if traffic spikes during/after trial. |
| All-Vercel serverless | $0–10/mo | 1–3 s on first request | Skip — requires V2 refactor of background queues. |

The trial scope (KONTi internal team + 1-2 clients) easily fits the **Developer** tier on both Vercel + Railway.

---

## Rollback

If a release breaks production:

1. **Vercel** — Vercel keeps every deploy. Project → Deployments → click an older one → **Promote to Production**.
2. **Railway** — Project → Deployments tab → click an older one → **Redeploy**.
3. **Postgres** — Neon has point-in-time restore on the paid tier; for the trial (free tier), backups are manual. Take a snapshot before any Drizzle schema change: `pg_dump $DATABASE_URL > backup.sql`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Dashboard renders but API calls 404 | Vercel rewrite has placeholder URL | Edit `vercel.json` → push |
| Railway build fails at `pnpm install` | Lockfile out of sync | `pnpm install` locally → commit `pnpm-lock.yaml` |
| `JWT_SECRET environment variable is required` | Missing env var on Railway | Add `JWT_SECRET` (48 random bytes) |
| Calculator empty after lead-accept | Drizzle migration not run | See Step 3 |
| AI chat returns 500 | Missing `ANTHROPIC_API_KEY` | Add to Railway env or rotate via `/integrations` |
| Whisper transcripts stuck on "pending" | Missing `OPENAI_API_KEY` | Add to Railway env |
| Receipts can't be scanned | Missing `PDF_CO_API_KEY` | Add to Railway env |
| Emails not sending | Missing `RESEND_API_KEY` | Add to Railway env + verify domain |

---

_Maintained alongside the codebase. Re-read before every production cutover._
