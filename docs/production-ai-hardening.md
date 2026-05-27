# Production AI Hardening

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

JoinerFlow AI features can be disabled with `AI_ENABLED=false`. Target production uses a Proxmox-hosted AI stack for Ollama, Qdrant, and chunking, while document drafts, import suggestions, operational risks, and labour warnings remain advisory outputs; they do not send documents, approve quotes, mutate workflow states, or modify financial totals.

## Runtime Safety

- AI startup validation is exposed through the authenticated admin route `/api/ai/health` and summarized in unauthenticated `/api/health`.
- Ollama outages are isolated to the AI request path. Core CRM routes continue to run when local inference is offline.
- Structured AI output is schema validated before use. Deterministic import, document, labour, and operations helpers avoid free-form commits.
- AI HTTP calls use request timeouts and abort controllers.
- Embeddings fall back to deterministic local vectors when embedding inference fails.
- Knowledge folder browsing dynamically discovers valid Synology shared folders under `/volume1/*`, while preserving canonical path checks, traversal blocking, symlink escape blocking, and root-bound browsing.
- Queue state is visible for embeddings and knowledge indexing from the admin System page.
- Vector index integrity checks report corrupt vectors and dimension mismatches.

## Admin Diagnostics

Open `System -> AI Diagnostics` to review:

- Ollama base URL, models, timeout and retry settings
- AI startup configuration warnings
- process and system memory pressure
- embedding queue depth
- knowledge indexing queue depth
- vector index integrity and rebuild readiness
- knowledge source statistics

## Recovery Procedures

1. If Ollama is offline, confirm the container or service is running and verify `OLLAMA_BASE_URL`.
2. If vector integrity reports corrupt rows, run the knowledge reindex action or embedding backfill.
3. If queues are stuck in `processing`, restart the server and rerun the relevant indexing job.
4. Before major AI changes, create a managed backup snapshot from the System page.
5. After restore, rerun AI health diagnostics to confirm queues and indexes are compatible with the restored database.

## Production Validation

Run these before shipping AI changes:

```bash
npm test
npm run test:coverage
npm run test:e2e
npm run test:visual
npm run build:release
npm run preflight:prod
```

Environment-specific failures in `preflight:prod` should be treated separately from code regressions. On Synology, expected checks include volume paths, production ports, Docker Compose validation, and remote AI endpoint availability when AI is enabled.

On the production NAS, also run:

```bash
sudo ./deployment/synology/scripts/check-health.sh
sudo ./deployment/synology/scripts/check-ai.sh
```
