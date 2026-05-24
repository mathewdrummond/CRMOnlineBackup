# Script Registry

Last updated: 2026-05-24

## Synology Scripts

| Script | Safety | Purpose |
|---|---|---|
| `deployment/synology/scripts/preflight-synology.sh` | read-only checks | Validate DSM, Docker, paths, env, ports |
| `deployment/synology/scripts/start-joinerflow-stack.sh` | starts services | Start core stack; starts local AI only when endpoints are local |
| `deployment/synology/scripts/stop-joinerflow-stack.sh` | creates backup, stops services | Graceful shutdown |
| `deployment/synology/scripts/restart-joinerflow-stack.sh` | stop/start | Restart stack |
| `deployment/synology/scripts/backup-joinerflow.sh` | writes backup snapshot | Backup DB, filesystem, env/docker diagnostics; remote AI storage excluded |
| `deployment/synology/scripts/restore-joinerflow.sh` | destructive restore | Creates safety backup, stops stack, restores selected snapshot |
| `deployment/synology/scripts/check-health.sh` | read-only checks | API, PostgreSQL, optional Qdrant |
| `deployment/synology/scripts/check-ai.sh` | read-only/inference | Ollama/Qdrant/API AI diagnostics |
| `deployment/synology/scripts/check-backups.sh` | read-only checks | Validate latest backup shape and SQLite integrity |
| `deployment/synology/scripts/check-storage.sh` | read-only checks | Disk and writable path checks |
| `deployment/synology/scripts/install-ollama-models.sh` | downloads models | Only for local NAS Ollama; skips remote endpoints |
| `deployment/synology/scripts/install-autostart.sh` | modifies `/etc/crontab` | Installs DSM root cron autostart/watchdog entries |
| `deployment/synology/scripts/prune-runtime.sh` | deletes old files, restarts compose | Prunes diagnostics/backups by age; use with care |
| `deployment/synology/scripts/watchdog-joinerflow-stack.sh` | can restart containers | Periodic health watchdog |
| `deployment/synology/scripts/sync-production-defaults.sh` | edits env file | Adds missing production defaults; `--overwrite` changes existing values |

## Root Node Scripts

| Script | Purpose |
|---|---|
| `scripts/start-local.mjs` | Start local dev API, CRM, and timeclock |
| `scripts/stop-local.mjs` | Stop local managed dev runtime |
| `scripts/production-preflight.mjs` | Validate production env/build/storage assumptions |
| `scripts/start-production.mjs` | Start built server directly for non-Docker Linux deployment |
| `scripts/build-release.mjs` | Build release artifacts |

## High-Risk Operations

- `restore-joinerflow.sh`: overwrites live database/files after safety backup.
- `prune-runtime.sh`: deletes old diagnostics/backups and runs compose down/up.
- `install-autostart.sh`: modifies system crontab.
- Any manual Qdrant collection deletion: requires explicit backup/snapshot first.

## Deprecated Or Historical Assets

Files with `.bak-*` suffix under `deployment/synology/scripts` and `deployment/synology/docker` are historical snapshots. Do not use them for deployment unless intentionally comparing rollback state.
