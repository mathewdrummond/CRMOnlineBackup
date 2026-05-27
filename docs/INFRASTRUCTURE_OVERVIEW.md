# JoinerFlow Infrastructure Overview

Last updated: 2026-05-27

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

This is the canonical overview for the intended Millbrook JoinerFlow infrastructure. For live inspection notes and dated observations, see [Millbrook Infrastructure Current State](millbrook-infrastructure-current-state.md).

## Target Architecture

JoinerFlow is a self-hosted workshop platform running on Millbrook-owned infrastructure with Synology storage, Proxmox compute, local AI services, and Tailscale remote access.

| Layer | Target host | Address | Purpose |
|---|---|---:|---|
| Hypervisor | `PVE` | `192.168.1.99` | Proxmox VE host for VMs/containers |
| NAS/storage | `Data` | `192.168.1.32` | Synology storage, JoinerFlow runtime data, backups |
| Application | Synology app stack on `Data` | `192.168.1.32` current | API, CRM UI, timeclock UI, database owner |
| AI stack | CT 201 `ai-millbrook` on Proxmox | `192.168.1.40` configured | Ollama, Qdrant, chunking, model warmup |
| DNS | Pi-hole/local DNS | Planned; REQUIRES VALIDATION | Internal records and fallback DNS |
| Remote access | Tailscale mesh | Tailscale IPs require validation | Admin and support access |

## Production Principles

- Business data remains owned by the JoinerFlow server process.
- SQLite remains the primary authoritative store until PostgreSQL primary mode is explicitly completed and tested.
- PostgreSQL is staged for shadow/parity and future primary operation.
- AI services are assistive. They do not directly mutate quotes, jobs, invoices, files, or workflow state.
- Qdrant stores vector search data; it is rebuildable from source documents and metadata but should still be backed up where practical.
- Remote access should use Tailscale, not public exposure of Proxmox, SSH, RDP, Qdrant, Ollama, or raw Node ports.
- Reverse proxy and DNS should be the only normal user-facing entry points.

## Core Domains

| Name | Purpose | Notes |
|---|---|---|
| `crm.millbrookfurniture.co.nz` | Primary CRM URL | Preferred production CRM domain |
| `joinerflow.local` | Local CRM alias | Internal DNS/hosts fallback |
| `clock.joinerflow.local` | Local timeclock alias | Internal DNS/hosts fallback |
| `timeclock.millbrookfurniture.co.nz` | Compatibility timeclock URL | Routed by Caddy; keep unless final domain policy changes |

## Data Ownership

| Data | Owner | Target location |
|---|---|---|
| SQLite business database | JoinerFlow API | `/volume1/joinerflow/server/joinerflow.sqlite` on `Data` unless app server moves |
| Attachments/filesystem | JoinerFlow API and NAS | `/volume1/joinerflow/filesystem` |
| Imports | JoinerFlow API and NAS | `/volume1/joinerflow/imports` |
| Logs | JoinerFlow API | `/volume1/joinerflow/logs` |
| Backups | Synology/NAS scripts | `/volume1/joinerflow/backups` plus off-box copy |
| Qdrant vectors | AI stack | Configured at `192.168.1.40:6333`; storage path on AI host requires validation |
| Ollama models | AI stack | Configured at `192.168.1.40:11434`; storage path on AI host requires validation |

## Dependency Order

1. Network, DNS, Tailscale, and storage available.
2. PostgreSQL container/service starts.
3. AI chunker/Ollama/Qdrant start on the AI host or the API runs in degraded AI mode until they are reachable.
4. JoinerFlow API starts and owns database migrations/health checks.
5. CRM and timeclock frontends start.
6. Reverse proxy starts and exposes user-facing hostnames.
7. Health, backup, and AI diagnostics run.

## Related Documentation

- [Network Architecture](NETWORK_ARCHITECTURE.md)
- [Services](SERVICES.md)
- [AI Stack](AI_STACK.md)
- [Port Registry](PORT_REGISTRY.md)
- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [Disaster Recovery](DISASTER_RECOVERY.md)
- [Script Registry](SCRIPT_REGISTRY.md)
