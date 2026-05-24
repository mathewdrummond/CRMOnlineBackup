# Infrastructure Audit 2026-05-24

## Scope

Reviewed operational documentation and deployment assets under:

- `docs/`
- `deploy/`
- `deployment/`
- `scripts/`

No `doc/` or `documentation/` directory exists in this repository at the time of audit.

## Current Target Architecture

- Proxmox VE host `PVE` at `192.168.1.99`.
- Synology NAS `Data` at `192.168.1.32`.
- Primary CRM domain `crm.millbrookfurniture.co.nz`.
- Local aliases `joinerflow.local` and `clock.joinerflow.local`.
- Tailscale mesh for remote admin access.
- Remote AI VM/container stack for Ollama, Qdrant, and chunking with 10 GB target allocation.
- SQLite remains primary business store; PostgreSQL remains staged/shadow unless separately promoted.

## Outdated Or Contradictory Information Found

| Area | Finding | Resolution |
|---|---|---|
| Proxmox IP | Docs referenced `192.168.1.34`; target is `192.168.1.99` | Updated canonical docs; retained `.34` as historical |
| NAS IP | Docs conflicted between `192.168.1.31` and `192.168.1.32` | Documented `.32` as NAS target and `.31` as valid/offline compatibility address |
| AI placement | Several docs assumed Synology-local Ollama/Qdrant | Updated docs and scripts for remote AI as target |
| AI memory | Docs referenced 8 GB or 16 GB local AI | Standardized target to 10 GB dedicated AI allocation |
| Domains | Examples used `crm.example.com`, `timeclock.example.com`, `joinerflow.example.com` | Updated Millbrook templates and docs; generic nginx examples remain examples |
| Timeclock domain | `timeclock.millbrookfurniture.co.nz` conflicted with target `clock.joinerflow.local` | Marked as compatibility/historical route requiring validation |
| Reverse proxy | Caddy only covered one configured public host plus hard-coded timeclock domain | Updated Caddy to include CRM/local aliases and compatibility timeclock route |
| Backups | NAS backup scripts required local Qdrant/Ollama data whenever `AI_ENABLED=true` | Patched scripts to only require local AI storage when endpoints are local |
| Installer | Main installer started all compose services, including local AI, even with remote endpoints | Patched installer to use remote-aware startup script |

## Unsafe Or High-Risk Scripts

| Script | Risk | Current status |
|---|---|---|
| `deployment/synology/scripts/restore-joinerflow.sh` | Destructive restore of database/files | Creates safety backup and validates snapshot; now remote-AI aware |
| `deployment/synology/scripts/prune-runtime.sh` | Deletes old diagnostics/backups and restarts compose | Still high risk; use manually and verify retention settings |
| `deployment/synology/scripts/install-autostart.sh` | Edits `/etc/crontab` | Backs up crontab and uses markers |
| `deployment/synology/install-joinerflow.sh` | Full install/start path | Patched to avoid starting local AI when remote endpoints are configured |
| Qdrant manual operations | Potential vector data loss | Docs require snapshot/rebuild plan before destructive changes |

## Obsolete Or Historical Assets

- `deployment/synology/docker/docker-compose.prod.yml.bak-*`
- `deployment/synology/scripts/*.bak-*`
- Older generic Linux/nginx examples under `deploy/`

These are retained as historical rollback/reference material. Do not use them as the active production deployment path.

## Missing Documentation Created

- [Infrastructure Overview](INFRASTRUCTURE_OVERVIEW.md)
- [Network Architecture](NETWORK_ARCHITECTURE.md)
- [AI Stack](AI_STACK.md)
- [Disaster Recovery](DISASTER_RECOVERY.md)
- [Services](SERVICES.md)
- [Port Registry](PORT_REGISTRY.md)
- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [Script Registry](SCRIPT_REGISTRY.md)

## Manual Validation Required

- Confirm Proxmox `PVE` is live at `192.168.1.99` and update Tailscale/DNS names.
- Confirm final AI host IP, VM/container ID, storage paths, and service manager.
- Confirm whether `192.168.1.31` remains intentional for NAS failover/client routing.
- Confirm Pi-hole VM/service IP and DNS record ownership once deployed.
- Confirm reverse proxy owner for production `443`: DSM nginx, Caddy direct, or another proxy.
- Confirm certificate strategy for `.local` names and `crm.millbrookfurniture.co.nz`.
- Add remote Qdrant snapshot schedule and retention.
- Add remote AI model backup or documented model re-pull procedure.
- Validate Tailscale ACLs and device names for Proxmox, NAS, AI, and Windows VMs.

## Suggested Next Improvements

- Add an AI host deployment manifest under `deployment/ai/` for Qdrant, Ollama, warmup, chunker, backup, and firewall rules.
- Add a machine-readable service inventory file consumed by docs and scripts.
- Add shellcheck in CI for `deployment/synology/scripts/*.sh`.
- Add markdown link validation in CI.
- Add a remote AI health script that runs from NAS and from the AI host.
