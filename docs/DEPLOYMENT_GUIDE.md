# Deployment Guide

Last updated: 2026-05-27

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

This is the canonical production deployment guide. Historical Linux and Synology guides remain useful but should defer to this document when infrastructure details conflict.

## Production Target

- Proxmox VE: `PVE`, `192.168.1.99`
- Synology NAS: `Data`, `192.168.1.32`
- CRM: `https://crm.millbrookfurniture.co.nz`
- Local CRM alias: `https://joinerflow.local`
- Local timeclock alias: `https://clock.joinerflow.local`
- Remote admin access: Tailscale
- AI stack: configured remote endpoint `192.168.1.40`; chunker reachable, Ollama/Qdrant require health remediation if AI features are needed

## Environment Files

Synology deployment reads:

```text
deployment/synology/env/.env.synology
deployment/synology/env/.env.production
deployment/synology/env/.env.ai
```

Templates:

```text
deployment/synology/env/synology.example
deployment/synology/env/production.example
deployment/synology/env/ai.example
```

Never commit live secrets.

## Deployment Order

1. Confirm network, DNS, Tailscale, and storage.
2. Create a backup if this is an update.
3. Sync/verify environment files.
4. Run Synology preflight.
5. Build containers.
6. Start stack.
7. Run health checks.
8. Run AI diagnostics if AI endpoints should be available.
9. Validate CRM/timeclock through final hostnames.

## Commands

```bash
cd /volume1/joinerflow-data
sudo ./deployment/synology/scripts/preflight-synology.sh
sudo ./deployment/synology/scripts/backup-joinerflow.sh
sudo ./deployment/synology/scripts/start-joinerflow-stack.sh
sudo ./deployment/synology/scripts/check-health.sh
sudo ./deployment/synology/scripts/check-ai.sh
```

For code updates:

```bash
sudo ./deployment/synology/restart-joinerflow-synology.sh
```

## Reverse Proxy

Use Caddy from the Synology stack when possible. If DSM nginx owns `443`, configure DSM nginx to proxy approved hostnames to Caddy on the NAS loopback or LAN mapped port.

## Current Deployment Caveats

- The compose file still includes local NAS `ollama` and `qdrant` fallback services. Current production uses remote AI endpoint configuration at `192.168.1.40`; start local NAS AI containers only as an intentional fallback.
- SQLite remains primary. Do not switch `DATABASE_DRIVER=postgres` for production primary mode until the repository migration work is completed and signed off.
- Remote AI backups are not fully automated from the NAS scripts. Add host-level Qdrant snapshots on the AI stack.
