# Port Registry

Last updated: 2026-05-27

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

## Production Ports

| Port | Service | Bind target | Exposure |
|---:|---|---|---|
| `22` | SSH | hosts only | Tailscale/admin LAN only |
| `80` | HTTP reverse proxy | Caddy/DSM nginx | redirect/health only |
| `443` | HTTPS reverse proxy | Caddy/DSM nginx | user-facing approved hostnames |
| `4000` | JoinerFlow API | `127.0.0.1` on app host | never public |
| `5432` | PostgreSQL internal | Docker network | internal only |
| `15432` | PostgreSQL host diagnostic mapping | `127.0.0.1` | local admin only |
| `6333` | Qdrant REST | AI host `192.168.1.40` configured | LAN/Tailscale/NAS only; timed out from NAS during 2026-05-27 check |
| `6334` | Qdrant gRPC | AI host `192.168.1.40` configured | LAN/Tailscale/NAS only |
| `8080` | CRM nginx inside container or mapped Caddy HTTP | app host | local/proxy only |
| `8081` | Timeclock nginx inside container | Docker network | proxy only |
| `8088` | AI chunker | AI host `192.168.1.40` configured | NAS/Tailscale only; health responded during 2026-05-27 check |
| `8443` | Caddy HTTPS mapped port when DSM owns `443` | app host/NAS | DSM nginx upstream/local LAN |
| `11434` | Ollama | AI host `192.168.1.40` configured | NAS/Tailscale only; timed out from NAS during 2026-05-27 check |
| `3001` | Open WebUI optional | `127.0.0.1` | disabled by default |
| `8006` | Proxmox UI | `PVE` | Tailscale/admin LAN only |
| `3389` | Windows RDP | Windows VMs | Tailscale only if enabled |

## Local Development Ports

| Port | Service |
|---:|---|
| `4000` | API |
| `5173` | CRM Vite dev server |
| `5174` | Timeclock Vite dev server |

## Rules

- Never expose `4000`, `6333`, `6334`, `8088`, `11434`, `8006`, or `3389` directly to the WAN.
- Keep database ports bound to Docker network or `127.0.0.1`.
- Prefer Tailscale ACLs for remote administration.
- Document any router port forwards before enabling them.
