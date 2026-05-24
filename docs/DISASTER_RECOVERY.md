# Disaster Recovery

Last updated: 2026-05-24

## Recovery Objectives

| Area | Target |
|---|---|
| Business database | Restore from latest verified SQLite or PostgreSQL backup |
| Files/attachments | Restore from snapshot filesystem component |
| Logs/diagnostics | Restore when needed for audit/debugging |
| AI vectors | Restore Qdrant snapshot when local; otherwise rebuild from source documents if unavailable |
| Models | Re-pull Ollama models or restore AI host model storage |
| Infrastructure | Rebuild from this repo plus documented env files and backups |

## Backup Sources

| Source | Location |
|---|---|
| Synology backup script | `deployment/synology/scripts/backup-joinerflow.sh` |
| Synology restore script | `deployment/synology/scripts/restore-joinerflow.sh` |
| Backup validation | `deployment/synology/scripts/check-backups.sh` |
| App managed backups | Admin/System UI |
| Current backup root | `/volume1/joinerflow/backups` |

Remote AI storage is not captured by NAS-local backup scripts unless the AI endpoint is configured as local compose services. Remote Qdrant snapshots and remote Ollama model backup are separate responsibilities and currently REQUIRES VALIDATION.

## Restore Sequence

1. Stop user access at the reverse proxy.
2. Record current state and create a safety backup.
3. Validate the candidate backup.
4. Stop JoinerFlow stack.
5. Restore database and filesystem data.
6. Start PostgreSQL, API, frontends, and proxy.
7. Verify API, CRM, timeclock, backups, and AI diagnostics.
8. Re-enable user access.

## Rebuild From Scratch

1. Provision or recover Proxmox `PVE` at `192.168.1.99`.
2. Provision Synology `Data` at `192.168.1.32`.
3. Restore `/volume1/joinerflow` runtime folders and env files.
4. Restore or redeploy the JoinerFlow app stack.
5. Restore or redeploy AI stack and models.
6. Restore DNS/Tailscale/reverse proxy records.
7. Run [Deployment Guide](DEPLOYMENT_GUIDE.md) validation.

## Manual Validation Required

- Off-box backup destination and schedule.
- Remote AI Qdrant snapshot path and retention.
- Remote Ollama model backup or re-pull procedure.
- Tailscale ACL backup/export.
- Pi-hole configuration backup once deployed.
