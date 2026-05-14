# Threat Model

## Project Overview

KONTi is a pnpm monorepo with an Express 5 API server in `artifacts/api-server` and a React + Vite dashboard in `artifacts/konti-dashboard`. It serves project-management, client portal, estimating, permit, inspection, document, and AI-assistant features for KONTi Design | Build Studio. The current implementation uses in-memory seed data instead of a database, but the production security properties still depend on correct server-side authentication, authorization, input handling, and protection of external-service keys.

The production-facing trust boundary is the browser/mobile client calling the Express API under `/api`. The dashboard stores auth state in browser storage and sends bearer tokens to the API. The API also calls third-party services including Anthropic/OpenAI, PDF.co, and Perplexity using server-held API keys.

## Assets

- **User accounts and sessions** — bearer tokens, user identities, and role assignments for admins, architects, superadmins, and clients. Compromise allows impersonation and cross-project access.
- **Project and client data** — project metadata, tasks, documents, invoices, permits, inspections, milestones, notes, audit logs, addresses, phone numbers, and client-linked ownership mappings. This is the main confidentiality target.
- **Business-sensitive estimating and construction data** — contractor estimates, labor rates, cost-plus figures, variance reports, and internal notes. Exposure harms both clients and the business.
- **Lead intake data** — names, emails, phone numbers, budgets, locations, and notes from prospective customers.
- **External-service credentials and billable capabilities** — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PDF_CO_API_KEY`, and `PERPLEXITY_API_KEY`. Abuse can leak data or incur cost.

## Trust Boundaries

- **Browser to API** — every request from the dashboard or any external caller crosses this boundary. The client is untrusted; every protected route must authenticate and authorize server-side.
- **Public to authenticated callers** — some routes are intended to be public (for example health checks and lead creation), while project, dashboard, estimating, and AI routes are generally not. This boundary is critical because many responses contain project and client data.
- **Authenticated team to authenticated client** — client users must only access projects mapped to their `clientUserId`, while team roles may access broader internal data. Ownership checks must be enforced on every client-callable project route.
- **API to third-party services** — the server sends project data to Anthropic/OpenAI, PDF.co, and Perplexity. Only authorized, scoped project data should cross this boundary, and public callers must not be able to trigger billable actions.
- **Production to dev-only artifacts** — `artifacts/mockup-sandbox` is assumed dev-only and should normally be ignored unless a production path imports or serves it.

## Scan Anchors

- Production API entry points: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/`
- Production client auth/storage path: `artifacts/konti-dashboard/src/hooks/use-auth.tsx`
- Highest-risk areas: `src/routes/auth.ts`, `src/middlewares/require-role.ts`, `src/routes/projects.ts`, `src/routes/estimating.ts`, `src/routes/ai.ts`, `src/routes/dashboard.ts`
- Public vs authenticated surfaces: unauthenticated routes should be limited to health and lead intake; all project, dashboard, estimating, document, PDF, inspection, milestone, and AI project routes should be authenticated and correctly scoped
- Dev-only area to ignore unless proven reachable: `artifacts/mockup-sandbox`

## Threat Categories

### Spoofing

Authentication is implemented with custom bearer tokens parsed in `artifacts/api-server/src/middlewares/require-role.ts` and persisted client-side in `artifacts/konti-dashboard/src/hooks/use-auth.tsx`. The system must ensure tokens are cryptographically unforgeable, expire appropriately, and cannot be manufactured from predictable identifiers. Authentication decisions must never depend on client-controlled role or storage state alone.

### Tampering

Authenticated callers can change project state through permit, proposal, change-order, note, and classification endpoints. The API must ensure every state-changing route validates the caller’s role and project ownership, especially when clients are allowed to act on project resources. Public callers must not be able to trigger billable external actions or mutate project artifacts.

### Information Disclosure

The API returns project metadata, client contact data, notes, inspections, milestones, estimates, receipts, audit logs, and generated reports. The application must require authentication for non-public data and must scope every client-visible response to the caller’s own project(s). PDF/report export routes must apply the same authorization rules as the JSON routes they summarize.

### Denial of Service

Several routes call external services or perform report generation. The system must prevent unauthenticated or cross-project callers from invoking billable or expensive operations, and should avoid exposing routes that allow broad scraping of project inventories.

### Elevation of Privilege

Role separation between client, team, architect, admin, and superadmin is central to the product. The API must enforce role checks and per-project ownership on every relevant route, not just on the frontend. Any bypass in token validation or missing ownership checks can let a low-privilege client read or modify other customers’ project data.