# Architecture

## Current Application

This repository is the current local-first Millbrook CRM / JoinerFlow application.

It is not the earlier Prisma-based prototype. The live codebase is a monorepo with:

- a CRM React app in `client/`
- a standalone time clock React app in `clock-client/`
- an Express API in `server/`
- a local SQLite database and local filesystem storage managed by the API

At runtime, both browser apps talk to the local API. The API owns authentication, module configuration, validation, persistence, audit logging, and file serving.

The operational guardrails for module dependencies, row-version writes, migrations, workflow
conversion, startup preflight, and shared UI primitives are summarized in
`docs/architecture-hardening.md`.

## Runtime Topology

| Workspace | Purpose | Main Entry | Build Output |
| --- | --- | --- | --- |
| `client` | CRM web app | `client/src/main.jsx` -> `client/src/App.jsx` | `client/dist/` |
| `clock-client` | Time clock web app | `clock-client/src/main.jsx` -> `clock-client/src/App.jsx` | `clock-client/dist/` |
| `server` | Local API and persistence layer | `server/src/index.ts` | `server/dist/` |

### Local Development Runtime

`npm run start:local` validates the local Node/dependency/script environment, then starts three
processes in the background:

- CRM app on `http://127.0.0.1:5173`
- time clock on `http://127.0.0.1:5174`
- API on `http://127.0.0.1:4000`

The local launcher performs preflight before stopping any managed process, then writes runtime state
to `.joinerflow-runtime/local-stack.json` and service logs to `.joinerflow-runtime/logs/`.
Service URLs, ports, npm scripts, and launcher summary output are centralized in
`scripts/local-startup-contract.mjs` so `npm run start:local` and `start-joinerflow.sh` use the
same startup contract.
Run `npm run start:local -- --check` to validate preflight and summary output without starting or
stopping local services.

### Production Runtime

`npm run build:release` builds:

- `client/dist`
- `clock-client/dist`
- `server/dist`

`npm run start:prod` starts the built API from `server/dist/index.js`.

The static CRM and time clock bundles are intended to be served by a web server or reverse proxy.

## High-Level Data Flow

### 1. Browser Apps

The CRM and time clock frontends are standard React single-page applications.

Shared frontend responsibilities:

- route rendering
- module-aware navigation and screen gating
- auth/session checks
- local cache and queued-offline mutation support through the local API client

Key frontend files:

- `client/src/App.jsx`
- `client/src/lib/AuthContext.jsx`
- `client/src/lib/ModuleContext.jsx`
- `client/src/api/localApiClient.js`
- `clock-client/src/App.jsx`

### 2. Local API Client

`client/src/api/localApiClient.js` is the browser-side adapter between the React apps and the local API.

It is responsible for:

- JSON requests to the Express API
- auth/session requests
- optimistic local caching for entity reads
- queued mutations when the API is temporarily unavailable
- background heartbeat and queue flush while the app is mounted
- API status reporting back to the UI

This means the browser can continue to read cached data and queue writes during short API interruptions, while the API remains the source of truth.

### 3. Express API

`server/src/index.ts` builds the Express app and wires together:

- `/health`
- auth endpoints
- module configuration endpoints
- generic entity CRUD endpoints
- filesystem endpoints
- stock endpoints
- workflow/time-tracking helpers
- admin audit and health endpoints

The API also performs startup repair and initialization tasks before serving traffic:

- database initialization
- time-tracking repair and constraint enforcement
- lead category default setup
- workflow default generation and task coverage checks
- filesystem directory creation

### 4. Persistence Layer

The persistence model is SQLite-backed and local to the machine running the API.

Primary data stores:

- SQLite database at `server/data/joinerflow.sqlite` by default
- local attachment storage under `server/filesystem/`
- structured logs under `server/logs/`

The API owns all reads and writes to these stores.

## Server Architecture

## API Surface

The server is intentionally centered around a generic entity record model plus domain-specific services.

Important server modules:

- `server/src/db.ts`
  Generic SQLite persistence, entity CRUD, audit logging, attachment versioning, row-version conflict handling.
- `server/src/auth.ts`
  Google sign-in verification, `AppUser` access control, signed session cookies, session invalidation.
- `server/src/appModules.ts`
  Core/optional module registry, dependency resolution, persisted module state, server-side module enforcement.
- `server/src/timeTracking.ts`
  Time entry normalization, active/paused/completed timer transitions, overlap detection, repairs, side effects.
- `server/src/stock.ts`
  Inventory, stock movements, shortages, purchase-order side effects, job material planning.
- `server/src/jobWorkflow.ts`
  Workflow templates, generated job/quote operations, workflow reconciliation.
- `server/src/leadCategories.ts`
  Lead category defaults and protected category lifecycle rules.
- `server/src/runtimeConfig.ts`
  Environment file loading and runtime config helpers.

## Validation Model

Validation now happens primarily on the server.

Current layers include:

- route-level request schemas for auth/config/upload endpoints
- entity write validation for critical entities such as `Staff`, `Job`, `Quote`, `PurchaseOrder`, `POItem`, and `TimeEntry`
- business-rule validation inside domain services such as time tracking and stock

The API rejects invalid data before it reaches SQLite.

## Concurrency Model

Entity records use optimistic concurrency with `row_version`.

This applies to:

- updates
- deletes
- queued/offline mutation replay

Generic entity updates must include a positive integer `row_version` in the JSON body, and deletes
must include a positive integer `row_version` query parameter. The local API client fills this from
the cache or fetches the current record before sending a mutation. If the app is offline and the
current version is unknown, the mutation is rejected instead of being queued.

When a stale write is submitted, the API returns a conflict response and the client refreshes the cached record.

## Client Architecture

### Component System

Shared UI primitives live under `client/src/components/ui/`.

The component catalog in `client/src/components/ui/component-catalog.js` records each primitive's
category, owner, exported API, and intended purpose. The matching catalog test fails when a new UI
primitive file is added without catalog metadata or when a primitive's named exports drift from the
documented API, which keeps component ownership and discoverability from drifting as the shared layer
grows.

## CRM App

The CRM app in `client/` contains:

- application shell and route definitions in `client/src/App.jsx`
- page-level screens under `client/src/pages/`
- shared UI components under `client/src/components/`
- business helpers under `client/src/lib/`

The CRM is the main operational interface for:

- contacts, companies, leads, quotes, jobs
- scheduling
- stock and purchasing
- reporting and alerts
- access admin, system health, and audit review

## Time Clock App

The standalone time clock app in `clock-client/` is a lightweight frontend that points at the same API.

It exists so workshop or kiosk users can use a simplified time-tracking surface without running the full CRM interface.

## Module Gating

The app has a server-defined module system.

Core modules always stay enabled:

- operations
- admin
- staff
- jobs
- activities
- timeclock

Optional modules are persisted in the `AppModuleConfig` record and enforced in two places:

- on the server for protected entity/routes
- in the client for route and UI gating

Module updates are validated against the server registry. Unknown module keys and non-boolean
module flags are rejected for admin writes, while malformed legacy stored flags are ignored for
effective gating and surfaced through `validation.storage_issues` on `/api/modules`.

The client keeps a last known-good module config and fails closed for optional modules if the config cannot be refreshed.

## Storage Model

## Database

The server stores business data in SQLite through a generic `entity_records` table model plus supporting tables for:

- audit logs
- schema migrations
- attachment version history

Schema migrations are recorded in SQLite `schema_migrations` and validated on startup before new
migrations run. Unknown future versions, renamed migration metadata, or incomplete migration history
fail startup with an actionable error instead of attempting silent repair. Each pending migration is
recorded in the same SQLite transaction as its schema changes.

Business records include entities such as:

- `Contact`
- `Company`
- `Lead`
- `Quote`
- `Job`
- `JobOperation`
- `TimeEntry`
- `PurchaseOrder`
- `POItem`
- `StockItem`
- `ExportHistory`
- `AppModuleConfig`
- `AppUser`

## Filesystem

The API stores attachment content and versions in `server/filesystem/`.

Default subdirectories include:

- `server/filesystem/jobs`
- `server/filesystem/quotes`
- `server/filesystem/contacts`
- `server/filesystem/.versions`

The API serves these files back through authenticated `/filesystem/*` routes with restrictive response headers.

## Logs

There are two main log areas:

- `server/logs/`
  Application and security logs written by the API.
- `.joinerflow-runtime/logs/`
  Local launcher logs for the CRM dev server, API dev server, and time clock dev server.

## Authentication And Access

The CRM uses Google Identity on the browser side plus server-side token verification and signed session cookies.

Important rules:

- the browser only needs `GOOGLE_CLIENT_ID`
- the server owns session creation and validation
- `AppUser` records control who can sign in
- admin-only screens are enforced server-side, not just by the UI
- logout invalidates the server-side session

The time clock can also run in a no-login kiosk mode when `TIMECLOCK_KIOSK_KEY` is configured.

## Operational Model

## Local Operations

Common local commands:

```bash
npm install
npm run start:local
npm run stop:local
```

Useful support commands:

```bash
npm run build:release
npm run check:prod
npm run smoke
npm test
```

## Health Checks

The API exposes:

```text
GET /health
```

Expected response:

```json
{"status":"ok","mode":"offline-local"}
```

## Deployment Assumptions

The current deployment model is:

- local SQLite and local attachment storage remain on the application host
- the API runs as a local Node process
- the CRM and time clock are built as static assets
- a reverse proxy is recommended for LAN-wide or public access

The live Millbrook deployment is the Synology NAS path under `deployment/synology/`.
The generic Linux files under `deploy/` remain as reference material, but NAS operation,
backup, restore, and health checks should use the Synology scripts.

## Related Documentation

- `README.md`
- `QUICKSTART.md`
- `START_HERE.md`
- `SYSTEM_VERIFICATION.md`
- `TESTING.md`
- `deploy/DEPLOYMENT.md`
- `deploy/BACKUP_RESTORE.md`
- `deploy/GO_LIVE_CHECKLIST.md`
- `deploy/FIREWALL_PORTS.md`
- `SECURITY.md`
