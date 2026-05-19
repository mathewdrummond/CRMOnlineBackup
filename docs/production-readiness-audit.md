# Production Readiness Audit

This audit records the production-readiness pass for JoinerFlow before Millbrook go-live.

## 2026-05-17 Architecture And Cleanup Audit

### Tooling Run

- `ts-prune -p server/tsconfig.json`: reported exported helpers and constants that are either used by tests, preserved module APIs, or candidates for later focused pruning.
- `ts-prune -p client/tsconfig.json`: no output.
- `depcheck` at root: reported root test dependencies as unused because tests live across workspaces; workspace-specific depcheck is more reliable.
- `depcheck` in `server`: no issues.
- `depcheck` in `client`: reported several unused UI/Radix/form/chart dependencies; these are mostly tied to shadcn-style component inventory and should be pruned only after UI usage review.
- `depcheck` in `clock-client`: no issues.
- `knip --no-progress`: reported generated output (`coverage`, `dist`), unused shadcn components, and many exported helpers. Treat as triage input, not direct deletion authority.
- `madge --circular --extensions ts,tsx,js,jsx server/src client/src clock-client/src`: initially found one circular dependency, now fixed.
- `npm run build --workspace=server`: passed after cycle fix.
- `npm run lint --workspace=client`: passed after fixing one redundant boolean cast.
- `npm test`: passed after the production PDF hardening and timeout adjustments, 90 files / 454 tests.
- `npm run test --workspace=server`: passed after making the workspace script run from repo root, 23 files / 198 tests.
- `npm run build:release`: passed for client, server, and clock client.
- `npm run preflight:prod`: still fails on local placeholder environment only: missing `PUBLIC_API_ORIGIN`, missing `TIMECLOCK_KIOSK_KEY`, `NODE_ENV=development`, relative local storage paths, and server production config rejecting missing `PUBLIC_API_ORIGIN`.
- Docker compose validation:
  - `docker compose -f deployment/synology/docker/docker-compose.prod.yml ... config`: passed.
  - `docker compose -f deployment/synology/docker/docker-compose.prod.yml -f deployment/synology/docker/docker-compose.ai.yml --profile ai-optional ... config`: passed.
- Docker image validation:
  - `docker build -f deployment/synology/docker/Dockerfile.server -t joinerflow-server-audit:latest .`: passed after adding `shared/` to the build context and installing system Chromium for production PDF generation.

### Architecture Map

- Root workspace: `client`, `server`, `clock-client`.
- Base44 contract fixtures now live under `server/src/__fixtures__/base44/entities`; the old archived duplicate app tree has been retired.
- Server: Express API, SQLite-backed entity store, audit log, attachment versioning, workflow/pricing/time/install modules, AI subsystem under `server/src/ai`.
- Client: Vite React CRM, local API wrapper in `client/src/api/localApiClient.js`, feature pages under `client/src/pages`, reusable UI under `client/src/components`.
- Clock client: separate Vite React timeclock surface with minimal dependencies.

### Route Inventory Summary

- Health: `/health`, `/api/health`.
- Auth: `/api/auth/config`, `/api/auth/google`, `/api/auth/logout`, `/api/auth/me`.
- Admin: access users, audit export/list, health, backup/import/restore/retention, diagnostics/log downloads, maintenance actions.
- AI: health, test, document drafts, semantic search, similar jobs/quotes, quote insights/risk, knowledge source CRUD, reindex/search/status/stats/pause.
- Business APIs: modules, dashboard, operations hub, reporting datasets, install planner, address search, filesystem, company detail, quote-to-job, pricing/imports/calculation, document templates, quote documents, generic entity CRUD/audit.

### Database Inventory Summary

- Core schema is intentionally compact:
  - `entity_records`
  - `audit_log`
  - `attachment_versions`
  - `schema_migrations`
- Current schema version: `4`.
- AI-owned tables are separate from business records:
  - `ai_embeddings`
  - `ai_knowledge_sources`
  - `ai_knowledge_files`
  - `ai_knowledge_chunks`
  - `ai_knowledge_queue`
  - `ai_knowledge_embedding_cache`
  - `ai_knowledge_state`
- Business mutation path still flows through entity CRUD, validation, row-version checks, permission checks, and audit logging.

### AI Inventory And Alignment

- Core AI client/config/health/diagnostics/logging:
  - `server/src/ai/aiClient.ts`
  - `server/src/ai/aiConfig.ts`
  - `server/src/ai/aiHealth.ts`
  - `server/src/ai/aiDiagnostics.ts`
  - `server/src/ai/aiLogger.ts`
  - `server/src/ai/structuredOutput.ts`
- Assistive AI domains:
  - documents: staged document drafts only
  - imports: staged review suggestions only
  - operations: deterministic risk analysis and briefing
  - labour: deterministic forecasting from historical operational records
  - embeddings/semantic search: local embedding index
  - knowledge: allowlisted filesystem indexing and retrieval
- AI modules that write to SQLite write only AI-owned support tables (`ai_embeddings`, `ai_knowledge_*`) and do not directly mutate authoritative business entities.
- AI outputs use typed payloads, confidence/reasoning fields, validation, and review-required states where they influence workflow decisions.

### Docker Inventory Summary

- Production compose services:
  - `joinerflow-server`
  - `joinerflow-client`
  - `joinerflow-clock-client`
  - `postgres`
  - `qdrant`
  - `ollama`
  - `caddy`
- Optional AI compose services:
  - `open-webui`
- Production hardening already present:
  - restart policies
  - health checks
  - internal network
  - localhost-bound service ports
  - read-only app/proxy containers
  - tmpfs for writable runtime paths
  - `no-new-privileges`
  - dropped capabilities
  - memory/PID limits
- Open WebUI is optional and bound to localhost, but `WEBUI_AUTH=false` means it must not be exposed through the public proxy without a separate access-control decision.

### Background Job Inventory

- Server startup queues initial embedding backfill and knowledge indexing scheduler.
- Semantic-search routes process bounded embedding queue batches before querying.
- Knowledge index routes process bounded queue batches and support pause/reindex/admin status.
- Local dev startup scripts spawn and detach app processes with runtime state tracking.

### Storage Path Inventory

- SQLite: `SQLITE_PATH`, production example `/volume1/joinerflow/server/joinerflow.sqlite`.
- Filesystem uploads: `FILESYSTEM_ROOT`, production example `/volume1/joinerflow/filesystem`.
- Backups: `BACKUP_ROOT`, production example `/volume1/joinerflow/backups`.
- Logs: `LOG_DIRECTORY`, production example `/volume1/joinerflow/logs`.
- AI knowledge roots: `AI_KNOWLEDGE_ALLOWED_ROOTS` plus dynamically discovered valid Synology shared folders under `/volume1/*`; production keeps app-owned roots such as `/volume1/joinerflow/filesystem,/volume1/joinerflow/imports`.
- Ollama models: `/volume1/joinerflow/ai/models`.
- Qdrant: `/volume1/vector-data/qdrant`.
- PostgreSQL data: `/volume1/docker/postgres`.

### Auth And Security Inventory

- Google Sign-In with server-side token verification.
- Signed session cookies, secure cookie support, session TTL, revocation timestamp.
- Bootstrap admin emails for first-run access.
- Admin-only routes for access management, health diagnostics, backups, logs, maintenance, AI knowledge source management.
- Entity read/write authorization gates and attachment visibility checks.
- Timeclock kiosk key path exists for kiosk-specific access.
- Production startup validates `PUBLIC_API_ORIGIN`, `GOOGLE_CLIENT_ID`, `AUTH_SESSION_SECRET`, `SQLITE_PATH`, `FILESYSTEM_ROOT`, and CORS origin alignment.

### Cleanup Applied

- Broke the only detected circular dependency by moving `DEFAULT_INSTALL_ESTIMATOR_SETTINGS` to `server/src/installEstimatorDefaults.ts`.
  - Risk: low.
  - Safety: the original export from `installEstimator.ts` is preserved, database defaults now depend on a leaf data module, and server build plus madge pass.
- Fixed `client/src/pages/AiKnowledgeIndexing.jsx` redundant boolean cast found by lint.
  - Risk: low.
  - Safety: behavior is equivalent.
- Added a root `.gitignore`.
  - Risk: low.
  - Safety: it prevents new runtime/build/test artifacts and local env files from entering the working tree. It does not remove currently tracked files.
- Hardened production PDF generation.
  - Risk: medium, because quote/contract PDF generation is customer-facing.
  - Safety: replaced undeclared runtime `playwright` usage with explicit `playwright-core`, installed Alpine Chromium and fonts in the server image, and kept the local/browser executable fallback path explicit.
- Fixed server Docker build context.
  - Risk: low.
  - Safety: server already imports `shared/moduleDefinitions.json`; copying `shared/` into the image makes Docker match local TypeScript builds.
- Fixed the server workspace test script.
  - Risk: low.
  - Safety: it now runs Vitest from repo root so cwd-sensitive tests and root project config resolve the same way as `npm test`.
- Increased focused PDF/auth test timeouts.
  - Risk: low.
  - Safety: assertions are unchanged; this only avoids false negatives when Chromium startup or CI load crosses the default 5 second limit.

### Cleanup Candidates Requiring Separate Decisions

- Base44 entity JSONC definitions are retained only as server test fixtures under `server/src/__fixtures__/base44/entities`.
- `coverage/`, `test-results/`, `.joinerflow-runtime/`, `.DS_Store`, `server/logs/`: generated artifacts. Safe to clean from future commits; currently some are tracked/modified and should be removed from version control in a dedicated generated-artifact cleanup.
- `client/src/components/ui/*`: many shadcn-style components are unused today. Because this is a design-system inventory, prune in small batches only when no feature roadmap depends on them.
- Client dependencies flagged by depcheck are mostly tied to unused component inventory. Remove only with the corresponding components.
- `server/src/index.ts` remains the largest architecture concentration. Refactor routes into modules incrementally, starting with AI routes or admin maintenance routes.
- `server/.env` and `server/.env.local` are tracked. Confirm they contain no live secrets, then move to untracked local files with tracked `.env.example` templates only.

## Hardened In This Pass

- Added `npm run preflight:prod` for non-destructive production environment checks.
- Added Linux restore tooling with backup validation, safety backup, staged restore, and rollback on failed swaps.
- Improved NAS backup and restore documentation around the Synology deployment.
- Added SQLite integrity reporting to Linux backups when `sqlite3` is available.
- Added production deployment, install, backup, upgrade, security, troubleshooting, and go-live documentation.
- Added an nginx example reverse-proxy configuration.

## Data Preservation Rules

- Never run demo seed/reset scripts against live Millbrook data.
- Always back up before migrations, upgrades, restore tests, or deployment changes.
- Keep backups outside the repo and outside the application data folder.
- Restore into staged folders first, then swap into place.
- Test restore on a copy before relying on it for go-live.

## Primary Production Risks To Keep Watching

- File access must remain quote/job scoped, especially from the Time Clock handover pack.
- Imports must be recoverable and should never partially apply without a clear review state.
- Document generation and printing should be tested with real large quotes and A3 drawings.
- Timeclock data should remain the source of truth for actual labour.
- Any public exposure should go through HTTPS and authentication; private Tailscale/LAN access is preferred.
- Architecture guardrails in `docs/architecture-hardening.md` should stay current when changing
  modules, migrations, workflow conversion, or shared UI primitives.

## Recommended Go-Live Validation

Run these on the production target before live use:

```bash
npm ci
npm run build
npm run preflight:prod
curl -f https://your-joinerflow-address/api/health
```

Then manually verify:

- Existing quotes, pricing, imports, categories, sections, uploaded files, generated documents, workflow tasks, install planner data, onboarding content, and timeclock records are present.
- A quote can be opened, reviewed, printed, and archived/restored.
- A supplier/Mozaik import can be reviewed without applying accidental changes.
- Time Clock opens on the intended staff address.
- Production Handover Pack files are visible only for the current quote/job.
- Backup and restore have been tested on a non-live copy.

## Remaining Recommendations

- Add a CI job that runs `npm run build`, focused server tests, and a production preflight using a safe temporary database.
- Add a scheduled restore drill, at least monthly during early live use.
- Keep a short paper fallback for the first week of production while staff confidence builds.
- Review logs after the first production day for import, file access, document generation, and timeclock warnings.
