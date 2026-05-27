# Synology Backup and Recovery

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

## What Is Backed Up

`deployment/synology/scripts/backup-joinerflow.sh` captures:

- SQLite snapshot (`database.sqlite`) when `DATABASE_DRIVER=sqlite`, or PostgreSQL logical dump (`database.postgres.sql`) when `DATABASE_DRIVER=postgres`
- attachment filesystem
- embeddings data
- Qdrant vector data when AI is enabled
- AI model/runtime data directory when AI is enabled
- imports directory
- Docker deployment config
- diagnostics directory
- manifest metadata and SQLite integrity output when applicable

Backup destination:

```text
/volume1/joinerflow/backups/snapshot-YYYYMMDD-HHMMSS
```

## Create a Backup

```bash
sudo ./deployment/synology/scripts/backup-joinerflow.sh
sudo ./deployment/synology/scripts/check-backups.sh
```

`check-backups.sh` validates required snapshot contents and SQLite integrity.

## Restore Procedure

1. Select a validated snapshot.
2. Run restore script:

```bash
sudo ./deployment/synology/scripts/restore-joinerflow.sh /volume1/joinerflow/backups/snapshot-YYYYMMDD-HHMMSS
```

Restore behavior:

1. Validates snapshot structure.
2. Runs integrity check on snapshot database.
3. Creates safety backup of current live state.
4. Stops stack, restores data, restarts stack.
5. Runs health checks post-restore.

## Rollback Strategy

If restore validation fails:

1. Use the auto-created safety snapshot from step 3 above.
2. Restore back to the safety snapshot using the same restore command.

## Scheduled Backups

Use `deployment/synology/system/joinerflow-backup.cron.example` in DSM Task Scheduler (or cron) for daily backup + verification.

## Retention Guidance

Recommended baseline:

1. Keep daily snapshots for 14 days.
2. Keep weekly snapshots for 8 weeks.
3. Keep monthly snapshots for 6 months.

Implement retention with a periodic cleanup script or DSM backup policy.
