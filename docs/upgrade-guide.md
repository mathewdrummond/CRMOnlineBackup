# JoinerFlow Upgrade Guide

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

Use this process for every live upgrade.

## Before Upgrade

1. Tell staff the system will be briefly unavailable.
2. Confirm no imports/document generation are running.
3. Create a backup.
4. Confirm backup exists and includes database plus filesystem.
5. Record current version/commit.

## Upgrade Steps

```bash
git pull
npm install
npm run build:release
npm run preflight:prod
sudo systemctl restart joinerflow-api
```

Synology NAS:

```bash
sudo ./deployment/synology/scripts/backup-joinerflow.sh
sudo ./deployment/synology/restart-joinerflow-synology.sh
sudo ./deployment/synology/scripts/check-health.sh
```

## After Upgrade

Check:

- login
- dashboard/operations
- leads
- quote detail
- pricing model
- import wizard
- document generation
- quote list printing
- production handover pack
- Time Clock
- workshop board
- install planner
- backup page/admin health

## Rollback

If an upgrade fails:

1. Stop backend.
2. Restore the pre-upgrade backup.
3. Rebuild or revert code to the previous known-good commit.
4. Run production preflight.
5. Start backend.
6. Validate with the go-live checklist.

Do not keep trying migrations against the same live database without a fresh backup.
