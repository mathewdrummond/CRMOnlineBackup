# JoinerFlow Phase 2-9 Migration Iteration (2026-05-17)

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

## Scope Completed In This Iteration

- Hardened AI queue backpressure behavior:
  - Added bounded embedding queue controls via `AI_EMBED_QUEUE_MAX` and `AI_EMBED_QUEUE_DELAY_MS`.
  - Added bounded knowledge queue controls via `AI_KNOWLEDGE_QUEUE_MAX`.
  - Added queue limit visibility in AI diagnostics payload.
- Improved embedding queue processing efficiency:
  - Replaced full-entity scans with direct record lookup during queue drain.
- Updated Synology runtime defaults to match current safe staged mode:
  - `DATABASE_DRIVER=sqlite`
  - `DATABASE_SHADOW_WRITE=true`
  - PostgreSQL remains active for parity mirror/migrations, not primary reads.
- Strengthened production preflight:
  - Added AI queue configuration bounds checks.
  - Added explicit fail-fast check when `DATABASE_DRIVER=postgres` is configured, because primary PostgreSQL runtime is not yet enabled in the current server data path.
- Removed confirmed deprecated artifacts:
  - `prisma/` legacy folder
  - `deploy/pm2/ecosystem.config.cjs`
  - `deploy/.DS_Store`
  - Unused legacy contract files in `server/src/contracts/`:
    - `contact.ts`
    - `contactInteraction.ts`
    - `contactTask.ts`

## Static Analysis Run (Triage Inputs)

- `ts-prune -p server/tsconfig.json`: produced candidate export list; many are module/public APIs and test helpers.
- `knip --workspace server`: flagged legacy files and additional unused export candidates.
- `depcheck server`: reported root-level test dependency resolution mismatch (`supertest`, `vitest`) due workspace dev dependency ownership.
- `madge --circular server/src/index.ts`: no circular dependencies detected.

## Current Architecture State

- SQLite remains deterministic runtime source-of-truth.
- PostgreSQL migration and shadow-write path is in place, but PostgreSQL primary read/write path is still intentionally gated.
- Qdrant and Ollama remain integrated and operational in the AI layer.
- AI remains assistive-only and non-authoritative.

## Remaining High-Impact Work

- Complete PostgreSQL primary runtime path in `server/src/db.ts` and route all core entity read/write operations through a database-neutral repository interface.
- Continue route decomposition from `server/src/index.ts` into modular route registrars.
- Introduce explicit service/repository boundaries for pricing/import/workflow mutation orchestration.
- Complete final dependency and dead-code pruning across client/server after workflow-by-workflow verification.
