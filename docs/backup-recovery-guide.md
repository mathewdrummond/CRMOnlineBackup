# JoinerFlow Backup & Recovery Guide

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

Backups protect the live Millbrook data: database, uploaded files, generated documents, and logs. The full data protection design is in [Data Protection Strategy](./data-protection-strategy.md).

## What Must Be Backed Up

- Database: `SQLITE_PATH` when `DATABASE_DRIVER=sqlite`, or PostgreSQL dump/volume when `DATABASE_DRIVER=postgres`
- File storage: `FILESYSTEM_ROOT`
- Logs: `LOG_DIRECTORY`
- Server environment: `server/.env` / `server/.env.local`
- Release files, or the source checkout used to build them
- AI vector/model data when local AI is enabled

## Backup Before Any Change

Before upgrades, migrations, restore tests, OS patching, or deployment changes:

```bash
deploy/linux/backup-joinerflow.sh /opt/joinerflow /var/backups/joinerflow
```

Synology NAS:

```bash
sudo ./deployment/synology/scripts/backup-joinerflow.sh
```

## Restore Rules

Never delete live data until the backup shape has been checked.

The provided restore scripts:

- check that the backup contains database and filesystem folders
- create a safety backup first
- stage replacement folders before moving them into place
- preserve environment files when they exist in the backup

Linux:

```bash
sudo systemctl stop joinerflow-api
deploy/linux/restore-joinerflow.sh /opt/joinerflow /var/backups/joinerflow/joinerflow-backup-YYYYMMDD-HHMMSS
sudo systemctl start joinerflow-api
```

Synology NAS:

```bash
sudo ./deployment/synology/scripts/restore-joinerflow.sh /volume1/joinerflow/backups/snapshot-YYYYMMDD-HHMMSS
```

## Restore Validation

After restore:

1. Open `/health`.
2. Run `npm run preflight:prod`.
3. Sign in.
4. Check one quote with files.
5. Check pricing categories and sections.
6. Check generated documents.
7. Check Time Clock.
8. Check Install Planner.
9. Create a fresh backup.

## Backup Retention

The app's managed scheduled backups use this default retention policy:

- hourly recovery points for 24 hours
- daily recovery points for 30 days
- weekly recovery points for 12 weeks

Manual and pre-restore safety snapshots are protected from automated tiered retention.

Keep at minimum one pre-go-live backup permanently.

Store at least one copy off the machine running JoinerFlow.

## Managed Restore Safety

Managed restore now:

1. verifies the selected snapshot
2. restores the database into a temporary validation file first
3. requires the confirmation token `RESTORE <snapshot-id>`
4. creates a pre-restore safety snapshot
5. promotes the restored database, filesystem, and logs only after validation

## Recovery Scenarios

Failed upgrade:

1. Stop backend.
2. Restore latest pre-upgrade backup.
3. Start backend.
4. Validate smoke paths.

Deleted file or quote:

1. Do not restore the whole system immediately.
2. Inspect current archive/restore options first.
3. If full restore is needed, restore to a separate machine/path, retrieve the file/data, then apply carefully.

Machine failure:

1. Install prerequisites.
2. Restore the JoinerFlow folder or clone.
3. Restore `server/data`, `server/filesystem`, environment file, and logs.
4. Run production preflight.
5. Start services.
