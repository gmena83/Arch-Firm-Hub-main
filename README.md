# KONTi Dashboard

Bilingual (EN/ES) project-management and client dashboard for **KONTi Design | Build Studio**, a Puerto Rico sustainable architecture firm specializing in shipping-container construction.

## What's here

| Path | What |
|------|------|
| `artifacts/api-server/` | Express 5 + Drizzle/Postgres API (TypeScript) |
| `artifacts/konti-dashboard/` | React + Vite SPA |
| `lib/db/` | Drizzle schema (`schema/lifecycle.ts`, `schema/estimating.ts`) |
| `lib/api-spec/` | OpenAPI spec → codegen source of truth |
| `lib/api-client-react/` | Codegen'd TanStack Query hooks |
| `lib/report-categories/` | Canonical 5-bucket report taxonomy |
| `docs/` | User manual, API key rotation guide |
| `attached_assets/` | KONTi's canonical xlsx + brand assets |

## Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Vercel + Railway + Neon deployment playbook.
- **[docs/user-manual.md](./docs/user-manual.md)** — Day-to-day usage guide for the KONTi team (bilingual).
- **[docs/api-key-rotation.md](./docs/api-key-rotation.md)** — Quarterly key rotation procedure.
- **[KONTI_V1_FEEDBACK_PLAN.md](./KONTI_V1_FEEDBACK_PLAN.md)** — 9-phase implementation plan from the 2026-05-11 meeting.
- **[SESSION_BREAKDOWN.md](./SESSION_BREAKDOWN.md)** — 4-session execution plan.
- **[CODEBASE_FINDINGS.md](./CODEBASE_FINDINGS.md)** — 43 known bugs + fixes.
- **[replit.md](./replit.md)** — Architecture overview (legacy filename; will be renamed to `ARCHITECTURE.md` once we cut the Replit cord).

## Local development

Prerequisites: Node.js v24, pnpm v11, Postgres (optional — falls back to in-memory seed data in dev).

```bash
# Install
pnpm install

# Run the dashboard
pnpm --filter @workspace/konti-dashboard run dev

# Run the api-server (separate terminal)
JWT_SECRET=$(node -e "console.log(crypto.randomBytes(48).toString('base64'))") \
  pnpm --filter @workspace/api-server run dev

# Typecheck the whole monorepo
pnpm typecheck
```

See [.env.example](./.env.example) for the full list of environment variables.

## Production deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the step-by-step playbook.

| Component | Where |
|-----------|-------|
| Dashboard | [Vercel](https://vercel.com) |
| API server | [Railway](https://railway.app) |
| Postgres | [Neon](https://neon.tech) |

## Demo seed data

The app boots with three example projects:

1. **Casa Solar — Rincón** (`proj-1`) — Pre-design phase.
2. **Bad Bunny Residence — Vega Alta** (`proj-2`) — Construction phase, 67% complete.
3. **Café Bellavista — San Juan** (`proj-3`) — Completed.

Test logins (see [seed.ts](./artifacts/api-server/src/data/seed.ts) `USERS`):
- Admin: `admin@konti.com`
- Architect: `carla@kontidesign.com`
- Client: any address ending in `@client.test`

## License

MIT. See [package.json](./package.json).

---

_Built with claude-code. Maintained by [Menatech](https://menatech.cloud)._
