# JoinerFlow PostgreSQL + Qdrant Migration Audit

Date: 2026-05-17
Phase: 1 - Full Architecture Audit
Scope: repository audit only. No removals or destructive migrations were performed.

Update: follow-up implementation iterations have now removed legacy `prisma/` and `deploy/pm2` remnants, introduced AI queue backpressure controls, and aligned Synology defaults to staged SQLite-primary plus PostgreSQL shadow-write mode.

## Executive Summary

JoinerFlow is currently a local-first TypeScript application with a SQLite-backed generic entity store, a file-system attachment layer, an embedded AI subsystem, and Synology Docker deployment scripts.

The codebase is already aligned with the core product principle that AI is assistive rather than authoritative: AI routes produce suggestions, drafts, search results, diagnostics, and risk summaries, while business writes still route through server handlers, validation, row-version checks, and audit logging.

The primary architecture gap for the PostgreSQL + Qdrant roadmap is that persistence is centralized in SQLite-specific primitives rather than a database-neutral repository layer. Business entities are stored as JSON in `entity_records`, indexed with SQLite JSON expressions, and backed up/restored using SQLite file-copy semantics. AI vectors are also stored inside SQLite tables, which conflicts with the target separation between business truth in PostgreSQL and semantic retrieval in Qdrant.

## Tooling Run

| Tool | Result |
| --- | --- |
| `ts-prune -p server/tsconfig.json` | Reported many exported candidates; most are module APIs, test helpers, schema/types, and deliberate service exports. Requires manual triage before removal. |
| `ts-prune -p client/tsconfig.json` | No output. |
| `depcheck --skip-missing=true` root | Reported root test/dev dependencies as unused. These are workspace/tooling false positives. |
| `depcheck --skip-missing=true` server | No issue. |
| `depcheck --skip-missing=true` client | Reported unused UI/development dependencies including several Radix/shadcn packages, `dayjs`, `next-themes`, `zod`, and unused eslint plugins. Requires UI-safe pruning later. |
| `depcheck --skip-missing=true` clock-client | No issue. |
| `knip --no-progress` | Reported unused shadcn components, historical deployment files, old Prisma files, and some active-app candidates that need manual verification. |
| `madge --circular --extensions ts,tsx,js,jsx server/src client/src clock-client/src` | No circular dependencies found. |
| `eslint-unused-imports` | Dependency exists in the client but is not wired into `client/eslint.config.cjs`; current client lint uses core `no-unused-vars` plus a local JSX helper. |

## Dependency Graph

High-level runtime dependency direction:

```text
client / clock-client
  -> client/src/api/localApiClient.js
  -> JoinerFlow HTTP API

server/src/index.ts
  -> auth.ts
  -> db.ts
  -> business modules: pricingModel, jobWorkflow, installPlanner, documentTemplates, quoteDocuments, adminOperations
  -> ai/*
  -> filesystem/logging/backup helpers

server/src/ai/*
  -> aiConfig/aiClient/promptTemplates/structuredOutput
  -> embeddings/*
  -> knowledge/*
  -> documents/imports/operations/labour intelligence
  -> db.ts for AI-owned SQLite support tables

deployment/synology/*
  -> Docker Compose
  -> server/client/clock Dockerfiles
  -> Caddy
  -> backup/restore/preflight/AI scripts
```

The current graph is mostly acyclic after the install-estimator default split. The largest coupling point is `server/src/index.ts`, which owns API routing and orchestrates many persistence and business operations directly.

## Module Inventory

### Server

- `server/src/index.ts`: Express app, route registration, request validation, upload/download, admin operations, pricing import workflows, document generation, AI route adapters, startup validation.
- `server/src/db.ts`: SQLite connection, schema setup, generic entity CRUD, row-version checks, audit log, attachment version metadata, backup/restore, schema migrations, query helpers.
- `server/src/auth.ts`: Google auth, session cookies, bootstrap admin handling, permission checks.
- `server/src/pricingModel.ts`: deterministic pricing/import calculations and supplier PDF parsing.
- `server/src/jobWorkflow.ts`: deterministic workflow operations, task generation, guard logic.
- `server/src/installPlanner.ts`, `installScheduling.ts`, `installEstimator.ts`: install planning and duration estimates.
- `server/src/documentTemplates.ts`, `quoteDocuments.ts`, `htmlPdf.ts`: deterministic template/document/PDF generation.
- `server/src/adminOperations.ts`: admin backup/log/diagnostic and maintenance helpers.
- `server/src/ai/*`: AI assistive subsystem.

### Client

- `client/src/pages/*`: CRM pages for dashboard, quotes, jobs, scheduling, purchasing, pricing, reporting, AI knowledge indexing, system health, admin.
- `client/src/components/*`: reusable workflow, time, schedule, reports, job, quote, company, contacts, help, and UI components.
- `client/src/api/localApiClient.js`: central frontend HTTP API wrapper. No direct browser DB access was found.
- `client/src/lib/*`: deterministic client-side helpers for workflows, pricing sections, reporting, time clock, scheduling, imports, layout/search caches.

### Clock Client

- Separate Vite app for kiosk/time-clock workflows using the same HTTP API style.

### Archived/Legacy

- Base44 entity definitions retained as test fixtures under `server/src/__fixtures__/base44/entities`.
- `prisma/`: old Prisma schema, migration, and seed files not part of the current runtime path.
- `deploy/pm2/`: old PM2 config outside the Synology Docker deployment path.

## Database Architecture Map

### Current Authoritative Store

Current production business data is SQLite via `better-sqlite3`.

Core tables created in `server/src/db.ts`:

- `entity_records`
  - Generic record table with `entity`, `id`, JSON `data`, `created_date`, `updated_date`, and `row_version`.
  - Uses SQLite JSON expression indexes for common fields such as `job_id`, `quote_id`, `lead_id`, `contact_id`, `company_id`, `staff_id`, `status`, dates, pricing supplier/SKU fields, and sort order.
- `audit_log`
  - Stores mutation audit records with actor, action, before/after JSON, and request metadata.
- `attachment_versions`
  - Stores file version metadata. File bytes live under `FILESYSTEM_ROOT`.
- `schema_migrations`
  - Application-managed SQLite migration ledger.

### AI Support Tables

- `ai_embeddings`
  - Stores entity semantic vectors in SQLite as JSON text.
- `ai_knowledge_sources`
- `ai_knowledge_files`
- `ai_knowledge_chunks`
- `ai_knowledge_queue`
- `ai_knowledge_embedding_cache`
- `ai_knowledge_state`

These AI/vector tables should move behind a Qdrant/vector service boundary in later phases. PostgreSQL should remain the authoritative business database, and Qdrant should hold semantic vectors/retrieval metadata only.

### ORM / Query Layers

- Active runtime uses direct `better-sqlite3` prepared statements and helper functions in `server/src/db.ts`.
- No active Prisma/Drizzle/Kysely/Knex/TypeORM runtime usage was found.
- `prisma/` appears abandoned or historical and should not be reused blindly.

## SQLite Assumptions

High-risk PostgreSQL migration assumptions:

- `better-sqlite3` synchronous connection and transaction API.
- SQLite `PRAGMA` usage for WAL, sync mode, foreign keys, optimize, integrity checks, page stats, and `user_version`.
- File-copy backup and restore semantics for the database file, WAL, and SHM files.
- SQLite JSON extraction indexes via `json_extract(data, '$.field')`.
- SQLite `INSERT OR REPLACE` and conflict syntax in schema/migration paths.
- Generic JSON entity storage rather than relational PostgreSQL tables.
- Production preflight and Synology scripts require `SQLITE_PATH`.
- Tests isolate workers by creating per-worker `.sqlite` files.

These are incompatible with a simple driver swap. PostgreSQL needs a planned persistence abstraction and migration layer.

## Persistence Patterns

Current patterns:

- Generic entity CRUD through `createEntityRecord`, `updateEntityRecord`, `deleteEntityRecord`, `getEntityRecord`, and list/query helpers.
- Mutations use expected `row_version` guards.
- Audit logging is coupled to entity mutations.
- Some route handlers in `server/src/index.ts` directly compose multi-step business mutations and pricing/import operations.
- AI indexing hooks refresh/delete embeddings after business entity writes.
- File metadata is in SQLite; file bytes are on disk.

Architecture drift:

- `server/src/index.ts` is acting as router, controller, service coordinator, validation boundary, and some workflow implementation.
- Persistence is centralized, but not in repository/service directories.
- Transaction handling exists, but transaction scope is tightly coupled to SQLite and not expressed as a portable unit-of-work abstraction.

## AI Architecture Map

Current AI modules are centralized under `server/src/ai`, which is directionally correct.

Inventory:

- `aiClient.ts`: Ollama text/structured generation wrapper.
- `aiConfig.ts`: Ollama and AI runtime env defaults.
- `aiHealth.ts`, `aiDiagnostics.ts`, `aiLogger.ts`: diagnostics, logs, queue/vector health.
- `promptTemplates.ts`, `structuredOutput.ts`, `aiTypes.ts`: structured prompt and response utilities.
- `documents/*`: quote summaries, variations, install updates, workshop handovers, procurement summaries.
- `imports/*`: SKU cleanup, supplier mapping, category classification, anomaly detection, PDF extraction cleanup.
- `operations/*`: workflow, install, labour, procurement, and daily operational risk analysis.
- `labourIntelligence.ts`: labour prediction and profitability insights.
- `historicalJobIntelligence.ts`: quote insights, quote risk, similar jobs.
- `embeddings/*`: entity embedding pipeline and semantic search over SQLite-stored vectors.
- `knowledge/*`: file-system knowledge indexing, chunking, queueing, retrieval, and SQLite vector search.

Alignment:

- AI currently returns suggestions, diagnostics, previews, search results, and drafts.
- No direct frontend DB access exists.
- AI-owned persistence is limited to support tables.

Misalignment for target architecture:

- Vector storage lives in SQLite instead of Qdrant.
- Qdrant is now the vector sidecar in Synology compose; ChromaDB paths are deprecated.
- Some semantic search is exposed in global layout search, which should remain bounded and explainable as embedded workflow assistance rather than generic chatbot behavior.

## API Inventory

Routes are defined in `server/src/index.ts`.

Major API groups:

- Health: `/health`, `/api/health`.
- Test-only: `/api/test/reset`, `/api/test/session`.
- Auth/session: `/api/auth/config`, `/api/auth/google`, `/api/auth/logout`, `/api/auth/me`.
- Modules/access: `/api/modules`, `/api/access/users`.
- Workflow: `/api/workflow/summary/:jobId`, `/api/workflow/quote-summary/:quoteId`.
- Admin/audit/health/logs/backups/diagnostics/maintenance.
- AI: `/api/ai/health`, `/api/ai/test`, `/api/ai/document-drafts`, `/api/ai/search`, `/api/ai/similar-jobs`, `/api/ai/similar-quotes`, quote insights/risk/similar historical jobs, knowledge source CRUD/search/status/stats/pause.
- Dashboard/operations/reporting/install planner.
- Address search.
- Filesystem upload/download/version/delete.
- Company detail.
- Quote conversion, quote inclusions, quote margin adjustments, quote documents.
- Document templates.
- Pricing imports, quote import staging/commit/update/delete, price-list staging/commit/rollback, category/section merges/deletes, calculations.
- Generic entity CRUD: `/api/entities/:entity`, `/api/entities/:entity/:id`, audit.

The API is functionally broad but route concentration is the main maintainability risk.

## Docker Inventory

Active Synology Docker files:

- `deployment/synology/docker/docker-compose.prod.yml`
  - `joinerflow-server`
  - `joinerflow-client`
  - `joinerflow-clock-client`
  - `postgres`
  - `qdrant`
  - `ollama`
  - `joinerflow-proxy` / Caddy
- `deployment/synology/docker/docker-compose.ai.yml`
  - optional `open-webui`
- `Dockerfile.server`
- `Dockerfile.client`
- `Dockerfile.clock-client`

Current storage layout in Docker config:

- `/volume1/joinerflow/server`
- `/volume1/joinerflow/filesystem`
- `/volume1/joinerflow/backups`
- `/volume1/joinerflow/logs`
- `/volume1/joinerflow/imports`
- `/volume1/joinerflow/ai/models`
- `/volume1/vector-data/qdrant`
- `/volume1/joinerflow/ai/open-webui`

Target drift:

- PostgreSQL and Qdrant services now exist in production compose, but SQLite remains the default primary database unless `DATABASE_DRIVER=postgres`.
- ChromaDB has been replaced; Qdrant is the active vector service.
- Backup/restore scripts now support SQLite snapshots or PostgreSQL logical dumps, and include Qdrant data when AI is enabled.

## Environment Variable Inventory

Production/server:

- `NODE_ENV`
- `HOST`
- `PORT`
- `PUBLIC_API_ORIGIN`
- `GOOGLE_CLIENT_ID`
- `AUTH_SESSION_SECRET`
- `AUTH_BOOTSTRAP_ADMIN_EMAILS`
- `ALLOWED_HOSTS`
- `CORS_ORIGIN`
- `TRUST_PROXY`
- `AUTH_SECURE_COOKIE`
- `AUTH_SESSION_TTL_HOURS`
- `TIMECLOCK_KIOSK_KEY`
- `SQLITE_PATH`
- `FILESYSTEM_ROOT`
- `BACKUP_ROOT`
- `LOG_DIRECTORY`
- `MAX_REQUEST_BODY_SIZE_MB`
- `DIAGNOSTICS_RETENTION_DAYS`
- `BACKUP_RETENTION_DAYS`

AI:

- `AI_ENABLED`
- `OLLAMA_BASE_URL`
- `OLLAMA_PRIMARY_MODEL`
- `OLLAMA_FAST_MODEL`
- `OLLAMA_EMBED_MODEL`
- `AI_KNOWLEDGE_ALLOWED_ROOTS`
- `AI_REQUEST_TIMEOUT_MS`
- `AI_REQUEST_RETRIES`
- `AI_RATE_LIMIT_MAX`
- `AI_RATE_LIMIT_WINDOW_MS`
- `AI_KNOWLEDGE_MAX_CONCURRENT`
- `OLLAMA_NUM_PARALLEL`
- `OLLAMA_MAX_LOADED_MODELS`
- `OLLAMA_KEEP_ALIVE`
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `QDRANT_COLLECTION_ENTITIES`
- `QDRANT_COLLECTION_KNOWLEDGE`
- `JOINERFLOW_ENABLE_OPEN_WEBUI`

Synology:

- `JOINERFLOW_PROJECT_NAME`
- `JOINERFLOW_INSTALL_ROOT`
- `JOINERFLOW_PUBLIC_HOST`
- `JOINERFLOW_PUBLIC_ORIGIN`
- `JOINERFLOW_TIMECLOCK_ORIGIN`
- `TZ`
- `JOINERFLOW_PROXY_HTTP_PORT`
- `JOINERFLOW_PROXY_HTTPS_PORT`
- `JOINERFLOW_SERVER_PORT`
- `JOINERFLOW_CLIENT_PORT`
- `JOINERFLOW_CLOCK_PORT`
- `JOINERFLOW_OLLAMA_PORT`
- `JOINERFLOW_QDRANT_PORT`
- `JOINERFLOW_OPEN_WEBUI_PORT`
- `JOINERFLOW_PUID`
- `JOINERFLOW_PGID`

Frontend:

- `VITE_API_BASE_URL`
- `VITE_APP_KIND`
- `VITE_ENABLE_TEST_AUTH`
- `VITE_TEST_AUTH_API_BASE_URL`
- `VITE_TIMECLOCK_KIOSK_KEY`
- `VITE_TIMECLOCK_URL`

PostgreSQL/Qdrant gaps:

- PostgreSQL/Qdrant envs are now available (`DATABASE_DRIVER`, `DATABASE_URL`/`PG*`, and `QDRANT_*`).

## Storage Architecture Inventory

Current storage surfaces:

- SQLite business DB: `SQLITE_PATH`.
- SQLite WAL/SHM sidecars.
- File attachment bytes: `FILESYSTEM_ROOT`.
- Backups/snapshots: `BACKUP_ROOT`.
- Logs: `LOG_DIRECTORY`.
- Imports: `${JOINERFLOW_INSTALL_ROOT}/imports`.
- AI models: `${JOINERFLOW_INSTALL_ROOT}/ai/models`.
- AI/Open WebUI data: `${JOINERFLOW_INSTALL_ROOT}/ai/open-webui`.
- Qdrant: `/volume1/vector-data/qdrant`.
- AI knowledge sources: configured app-owned roots plus dynamically discovered valid Synology shared folders under `/volume1/*`.

Target storage changes:

- PostgreSQL bind mount: `/volume1/docker/postgres` or equivalent.
- Qdrant bind mount: `/volume1/vector-data/qdrant` or equivalent.
- Keep business file attachments outside PostgreSQL.
- Keep semantic vectors outside PostgreSQL.
- Backup strategy must become logical PostgreSQL dump plus filesystem/Qdrant snapshots, not SQLite file copy only.

## Dead Code / Deprecated System Candidates

Do not remove in Phase 1; these need manual confirmation or later phased cleanup:

- Base44 entity JSONC definitions are retained only as server test fixtures under `server/src/__fixtures__/base44/entities`; the archived duplicate source tree has been retired.
- `prisma/`: old Prisma schema/migration/seed. No active runtime uses Prisma.
- `deploy/pm2/ecosystem.config.cjs`: likely pre-Docker deployment remnant.
- Large unused shadcn/Radix component set in `client/src/components/ui`.
- `client/src/App.css`, `client/src/components/design-system/index.jsx`, and several UI/page candidates flagged by `knip`; verify route reachability before pruning.
- `server/src/seed.ts` and `server/src/smoke.ts`: flagged by `knip`; likely utility scripts or old entry points.
- Contract default files under `server/src/contracts/*`: flagged as unused, but may be intended schema/default references.

## Duplicate / Drift Findings

- Generic business entity persistence is centralized but too low-level and SQLite-specific for PostgreSQL migration.
- Some deterministic workflow helpers exist in both client-side preview helpers and server-side authoritative logic. Client helpers should remain preview-only and must not become authoritative.
- AI semantic search has two stores: entity embeddings and file knowledge chunks, both SQLite-backed. Qdrant should consolidate vector search behind a typed service boundary.
- ChromaDB infrastructure has been removed from active compose/scripts.
- Synology docs/scripts now target SQLite/PostgreSQL staging and Qdrant vector storage.

## PostgreSQL Migration Risks To Address In Phase 2

1. Generic JSON table design may not map cleanly to relational PostgreSQL constraints.
2. Row-version semantics must be preserved exactly.
3. Audit logging must remain transactionally coupled to business mutations.
4. Backup/restore must change from file-copy to PostgreSQL-safe logical/physical backup.
5. SQLite JSON indexes must be replaced by PostgreSQL JSONB indexes or relational columns.
6. Query helpers currently emit SQLite-oriented SQL and cannot be reused unchanged.
7. Tests assume per-worker SQLite files and will need PostgreSQL test database isolation.
8. AI embedding writes must be separated from business transactions as Qdrant sync jobs.

## Recommended Phase 2 Direction

For planning only, no implementation yet:

- Introduce a database adapter boundary before replacing SQLite.
- Define a `DatabaseProvider` abstraction for transaction lifecycle, prepared queries, health, migrations, and diagnostics.
- Keep SQLite support temporarily for rollback/backward compatibility.
- Design PostgreSQL schema ownership explicitly:
  - either JSONB-first compatibility tables initially,
  - or staged relational tables for high-value entities.
- Preserve `row_version` optimistic concurrency and audit writes inside the same transaction as business mutations.
- Move AI vectors toward Qdrant through a new `server/src/ai/vectorStore.ts` interface.
- Keep Qdrant as the single vector backend and continue migration tooling toward PostgreSQL primary mode.
- Keep AI indexing asynchronous and non-authoritative.

## Phase 1 Conclusion

The codebase is ready for a PostgreSQL migration planning phase, but not for direct PostgreSQL implementation yet. The safest path is:

1. Plan persistence boundaries and schema strategy.
2. Add PostgreSQL infrastructure alongside SQLite.
3. Migrate service/repository boundaries without changing business behavior.
4. Introduce Qdrant as a vector-only subsystem.
5. Only then migrate authoritative data.
