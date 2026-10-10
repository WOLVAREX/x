# AGENTS.md

## Scope

These instructions apply to this repository. Preserve the existing architecture and make small, targeted changes. Inspect only files relevant to the task, do not install dependencies unless asked, and run only checks relevant to the change.

## Project overview

J.H.P is a managed bot-hosting platform. Users authenticate, fund a coin wallet through Paystack, choose a time-limited hosting plan, configure a bot template, and deploy it to Heroku. The platform also supports deployment control, logs, health checks, archival/recovery, and administrative management.

Production is a single Render web service: the Express server exposes `/api`, serves the compiled React SPA, and provides the SPA fallback.

## Technology stack

- pnpm workspace; use pnpm only (`packageManager: pnpm@11.15.0`).
- Node.js 24, TypeScript 5.9, ESM.
- Frontend: React 19, Vite, Wouter, TanStack Query, Tailwind CSS 4, Radix/shadcn-style components.
- Backend: Express 5, JWT bearer authentication, Passport Google/GitHub OAuth, Pino.
- Database: PostgreSQL, Drizzle ORM, `node-postgres`.
- API contract: OpenAPI and Orval-generated React Query clients/Zod schemas.
- Integrations: Heroku Platform API, GitHub repositories, Paystack, Google OAuth, GitHub OAuth.

## Important directories

- `artifacts/junex/`: production React application.
  - `src/App.tsx`: client route map and providers.
  - `src/pages/`: public, authenticated, and admin pages.
  - `src/hooks/use-auth.tsx`: token and current-user state.
- `artifacts/api-server/`: Express API and production static server.
  - `src/app.ts`: middleware, API mount, static files, social metadata, SPA fallback.
  - `src/routes/`: API endpoints. `deployments.ts` contains the critical Heroku lifecycle.
  - `src/lib/`: authentication, settings, plans, logs, expiry, and health monitors.
- `lib/db/`: Drizzle connection and PostgreSQL schema.
- `lib/api-spec/openapi.yaml`: source of truth for generated API operations.
- `lib/api-client-react/`: generated React Query client plus shared fetch wrapper.
- `lib/api-zod/`: generated request/response schemas.
- `artifacts/mockup-sandbox/`: component-preview tooling; normally outside product work.
- `scripts/`: workspace utilities; review carefully because scripts may contain sensitive or stale material.
- `render.yaml`: Render build, start, health check, and environment configuration.

## Architecture and runtime rules

- The browser calls same-origin `/api`; Vite proxies it to `localhost:8080` in development.
- JWTs are stored under `junex_token` and attached as bearer tokens by the shared API fetcher.
- Protected server routes must use `requireAuth`; administrator routes must use `requireAdmin`.
- Deployment creation and coin deduction must remain atomic. Preserve the per-user advisory lock that prevents duplicate bot names.
- Heroku deployment creates an app, provisions Postgres, applies config, builds a GitHub tarball, and scales a worker or web dyno.
- `DATABASE_URL` is managed by Heroku. Never accept it as a user-editable variable or overwrite it from template/user input.
- Deleting a user deployment archives its database record for recovery while removing the Heroku app. Preserve recovery and remaining-plan behavior.
- Deployment status describes Heroku build/dyno state; it does not verify WhatsApp session authentication.
- Background deployment, health, and plan-expiry work currently runs in the API process. Account for process restarts when changing these flows.
- Team images currently use local filesystem storage, which may be ephemeral in production.

## Coding conventions

- Follow the existing TypeScript ESM style, functional React components, hooks, early route returns, and Drizzle query patterns.
- Reuse existing UI primitives and Tailwind tokens instead of introducing parallel component systems.
- Prefer generated TanStack Query hooks for operations represented in OpenAPI. Some newer endpoints use manual `fetch`; keep authorization and error handling consistent.
- Do not edit files in `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/` directly. Update OpenAPI and regenerate them.
- Keep the OpenAPI contract synchronized with route paths, payloads, response shapes, and authorization requirements.
- Validate untrusted request data at the API boundary. Do not rely only on client validation.
- Preserve transactional/idempotent behavior for payments, wallet credits, coin debits, and recovery charges.

## Commands

Run commands from this repository root.

- `pnpm run typecheck`: type-check libraries, applications, and scripts.
- `pnpm run build`: type-check, then build the frontend and API.
- `pnpm --filter @workspace/junex dev`: run the Vite frontend on port 5000.
- `pnpm --filter @workspace/api-server dev`: build and run the API; `PORT` and `DATABASE_URL` are required.
- `pnpm --filter @workspace/api-spec codegen`: regenerate API client and Zod output after OpenAPI changes.
- `pnpm --filter @workspace/db push`: push the Drizzle schema. Database changes require explicit care because no migration history is currently checked in.

Do not weaken the workspace's `minimumReleaseAge: 1440` supply-chain safeguard. Do not commit `node_modules`, build output, `.env` files, uploads, or runtime artifacts.

## Safety and fragile areas

- Never commit or expose passwords, JWTs, OAuth tokens, Paystack secrets, Heroku keys, database URLs, or bot environment values. Do not log them.
- Treat stored deployment environment variables and database-backed integration settings as secrets.
- Payment webhooks require raw-body HMAC verification and idempotent crediting. Do not add or extend webhook behavior without preserving both.
- There are two legacy financial representations (`walletBalance` and the active `coinBalance`). Current hosting plans charge coins; do not mix the models accidentally.
- The live API includes endpoints absent from OpenAPI. Check both Express routes and generated clients before changing an API.
- Heroku behavior depends on app ownership, Team settings, dyno type, buildpack declarations, GitHub branch discovery, and add-on provisioning. Preserve failure logging and recovery paths.
- Schema changes must consider existing production data, foreign-key cascades, settings compatibility, and rollback. Prefer an explicit migration plan over an unreviewed schema push.
- The project has no meaningful automated test suite. For risky changes, add focused tests where practical and manually verify authorization, concurrency, payment idempotency, and failure recovery.
- Documentation may lag behind behavior. Verify claims against the implementation, especially wallet/coin pricing and secret handling.

## Change workflow

1. Read the affected route/page, its schema, and any matching OpenAPI operation.
2. Identify external side effects and existing transaction/idempotency boundaries.
3. Make the smallest change that preserves current API and deployment behavior.
4. Regenerate clients only when the OpenAPI source changes.
5. Run targeted type checks or builds appropriate to the edited packages.
6. Confirm unrelated files and generated artifacts were not changed.
