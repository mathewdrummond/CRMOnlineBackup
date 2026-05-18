# JoinerFlow Synology DS225+ Installation Guide

## Scope

This guide installs JoinerFlow as a Docker stack on Synology DSM 7.2+ with:

- `joinerflow-server`
- `joinerflow-client`
- `joinerflow-clock-client`
- `ollama`
- `caddy` reverse proxy

Optional AI containers are defined separately in `deployment/synology/docker/docker-compose.ai.yml`.

## 1. Prerequisites

1. DSM 7.2 or later.
2. Synology `Container Manager` package installed.
3. SSH enabled on NAS.
4. Enough resources:
   - RAM: minimum 2 GB, recommended 4 GB.
   - Storage: minimum 15 GB free.
5. DNS/hostnames prepared:
   - CRM: `joinerflow.example.com`
   - Timeclock: `clock.joinerflow.example.com`

## 2. Copy Repository to NAS

Clone or copy this repo to a persistent application path, for example:

```bash
/volume1/joinerflow/app/Millbrook-CRM
```

## 3. Configure Environment

Edit:

- `deployment/synology/env/.env.synology`
- `deployment/synology/env/.env.production`
- `deployment/synology/env/.env.ai`

Required production values:

- `PUBLIC_API_ORIGIN`
- `GOOGLE_CLIENT_ID`
- `AUTH_BOOTSTRAP_ADMIN_EMAILS`
- `SQLITE_PATH`
- `FILESYSTEM_ROOT`
- `TIMECLOCK_KIOSK_KEY`

Current staged database mode defaults:

- `DATABASE_DRIVER=sqlite`
- `DATABASE_SHADOW_WRITE=true`

This keeps deterministic SQLite runtime behavior while mirroring writes into PostgreSQL for parity validation.

All storage paths must remain absolute and under `/volume1/joinerflow/...`.

Optional default sync:

```bash
./deployment/synology/scripts/sync-production-defaults.sh
```

Force overwrite from lower/base env values:

```bash
./deployment/synology/scripts/sync-production-defaults.sh --overwrite
```

## 4. Run Dependency and Preflight Checks

```bash
cd /volume1/joinerflow/app/Millbrook-CRM
./deployment/synology/installers/install-dependencies-synology.sh
./deployment/synology/scripts/preflight-synology.sh
```

If preflight fails, fix the remediation items before proceeding.

## 4.1 Build Single DS225+ Zip Bundle

From a prepared working copy, create a single install zip:

```bash
./deployment/synology/package-ds225-bundle.sh
```

Output artifact:

- `release/joinerflow-ds225-<timestamp>.zip`

This bundle preserves executable permissions for all `deployment/synology/*.sh` scripts.

## 5. Install JoinerFlow

```bash
./deployment/synology/install-joinerflow.sh
```

Installer actions:

1. Runs preflight.
2. Creates required directory structure under `JOINERFLOW_INSTALL_ROOT`.
3. Generates missing secrets.
4. Validates env safety.
5. Installs npm dependencies and builds release artifacts.
6. Builds and starts Docker services.
7. Pulls Ollama models and validates inference.
8. Runs health/storage checks.
9. Creates initial backup snapshot.

## 6. Validate Deployment

Run:

```bash
./deployment/synology/scripts/check-health.sh
./deployment/synology/scripts/check-ai.sh
./deployment/synology/scripts/check-storage.sh
./deployment/synology/scripts/check-backups.sh
```

Expected:

- API health returns `ok` at `/health`.
- Ollama model list includes required models.
- SQLite path writable and integrity check `ok`.
- Latest backup snapshot contains required components.

## 7. Day-2 Operations

Lifecycle commands:

```bash
./deployment/synology/start-joinerflow-synology.sh
./deployment/synology/stop-joinerflow-synology.sh
./deployment/synology/restart-joinerflow-synology.sh
```

Backups:

```bash
./deployment/synology/scripts/backup-joinerflow.sh
```

Restore:

```bash
./deployment/synology/scripts/restore-joinerflow.sh /volume1/joinerflow/backups/snapshot-YYYYMMDD-HHMMSS
```

## 8. Synology UI Screenshots To Capture

For internal runbooks, capture these DSM screens:

1. Package Center: `Container Manager` installed.
2. Container Manager > Project: JoinerFlow stack status.
3. Control Panel > Task Scheduler: backup cron entry.
4. Reverse Proxy/Certificate settings if using DSM proxy instead of Caddy.
