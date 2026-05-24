# JoinerFlow Synology Installation Guide

## Scope

This guide installs the JoinerFlow application stack on Synology DSM 7.2+. The intended production architecture uses the NAS for application runtime data and backups, while AI services run on a Proxmox-hosted AI stack.

- `joinerflow-server`
- `joinerflow-client`
- `joinerflow-clock-client`
- `postgres`
- `caddy` reverse proxy

The compose file still contains `qdrant` and `ollama` services for legacy NAS-local fallback. Production should use remote AI endpoints unless the architecture is deliberately collapsed onto the NAS.

Optional Open WebUI is defined separately in `deployment/synology/docker/docker-compose.ai.yml`.

## 1. Prerequisites

1. DSM 7.2 or later.
2. Synology `Container Manager` package installed.
3. SSH enabled on NAS.
4. Enough resources:
   - RAM: minimum 2 GB for CRM without local AI.
   - RAM: 10 GB dedicated allocation on the AI stack for the target local inference workload.
   - Storage: minimum 15 GB free.
5. DNS/hostnames prepared:
   - CRM: `crm.millbrookfurniture.co.nz`
   - Local CRM: `joinerflow.local`
   - Timeclock: `clock.joinerflow.local`

## 2. Copy Repository to NAS

Clone or copy this repo to a persistent application path. Millbrook production uses:

```bash
/volume1/joinerflow-data
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

Application-owned storage paths should remain absolute and under `/volume1/joinerflow/...`. The production source checkout can live outside that runtime data root. AI knowledge browsing additionally mounts `/volume1` read-only into the server so administrators can select valid Synology shared folders without granting arbitrary Linux filesystem access.

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
cd /volume1/joinerflow-data
sudo ./deployment/synology/installers/install-dependencies-synology.sh
sudo ./deployment/synology/scripts/preflight-synology.sh
```

If preflight fails, fix the remediation items before proceeding.

## 4.1 Build Single Synology Zip Bundle

From a prepared working copy, create a single install zip:

```bash
./deployment/synology/package-ds225-bundle.sh
```

Output artifact:

- `release/joinerflow-synology-<timestamp>.zip`

This bundle preserves executable permissions for all `deployment/synology/*.sh` scripts.

## 5. Install JoinerFlow

```bash
sudo ./deployment/synology/install-joinerflow.sh
```

Installer actions:

1. Runs preflight.
2. Creates required directory structure under `JOINERFLOW_INSTALL_ROOT`.
3. Generates missing secrets.
4. Validates env safety.
5. Installs npm dependencies and builds release artifacts.
6. Builds and starts Docker services.
7. Skips NAS-local Ollama model installation when AI endpoints are remote.
8. Runs health/storage checks.
9. Creates initial backup snapshot.

## 6. Validate Deployment

Run:

```bash
sudo ./deployment/synology/scripts/check-health.sh
sudo ./deployment/synology/scripts/check-ai.sh
sudo ./deployment/synology/scripts/check-storage.sh
sudo ./deployment/synology/scripts/check-backups.sh
```

Expected:

- API health returns `ok` at `/health`.
- Ollama model list includes required models when remote AI is reachable.
- SQLite path writable and integrity check `ok`, or PostgreSQL connection checks pass when `DATABASE_DRIVER=postgres`.
- Latest backup snapshot contains required components.

## 7. Day-2 Operations

Lifecycle commands:

```bash
sudo ./deployment/synology/start-joinerflow-synology.sh
sudo ./deployment/synology/stop-joinerflow-synology.sh
sudo ./deployment/synology/restart-joinerflow-synology.sh
```

Backups:

```bash
sudo ./deployment/synology/scripts/backup-joinerflow.sh
```

Restore:

```bash
sudo ./deployment/synology/scripts/restore-joinerflow.sh /volume1/joinerflow/backups/snapshot-YYYYMMDD-HHMMSS
```

## 8. Synology UI Screenshots To Capture

For internal runbooks, capture these DSM screens:

1. Package Center: `Container Manager` installed.
2. Container Manager > Project: JoinerFlow stack status.
3. Control Panel > Task Scheduler: backup cron entry.
4. Reverse Proxy/Certificate settings if using DSM proxy instead of Caddy.
