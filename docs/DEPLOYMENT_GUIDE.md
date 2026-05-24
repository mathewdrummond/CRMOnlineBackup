# Deployment Guide

Last updated: 2026-05-24

This is the canonical production deployment guide. Historical Linux and Synology guides remain useful but should defer to this document when infrastructure details conflict.

## Production Target

- Proxmox VE: `PVE`, `192.168.1.99`
- Synology NAS: `Data`, `192.168.1.32`
- CRM: `https://crm.millbrookfurniture.co.nz`
- Local CRM alias: `https://joinerflow.local`
- Local timeclock alias: `https://clock.joinerflow.local`
- Remote admin access: Tailscale
- AI stack: remote VM/container stack, exact address REQUIRES VALIDATION

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

- The compose file still includes local NAS `ollama` and `qdrant` fallback services. Production intended architecture should use remote AI endpoints unless explicitly deploying AI locally.
- SQLite remains primary. Do not switch `DATABASE_DRIVER=postgres` for production primary mode until the repository migration work is completed and signed off.
- Remote AI backups are not fully automated from the NAS scripts. Add host-level Qdrant snapshots on the AI stack.
