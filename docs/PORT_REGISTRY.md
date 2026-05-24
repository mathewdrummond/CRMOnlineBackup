# Port Registry

Last updated: 2026-05-24

## Production Ports

| Port | Service | Bind target | Exposure |
|---:|---|---|---|
| `22` | SSH | hosts only | Tailscale/admin LAN only |
| `80` | HTTP reverse proxy | Caddy/DSM nginx | redirect/health only |
| `443` | HTTPS reverse proxy | Caddy/DSM nginx | user-facing approved hostnames |
| `4000` | JoinerFlow API | `127.0.0.1` on app host | never public |
| `5432` | PostgreSQL internal | Docker network | internal only |
| `15432` | PostgreSQL host diagnostic mapping | `127.0.0.1` | local admin only |
| `6333` | Qdrant REST | AI stack | LAN/Tailscale/NAS only |
| `6334` | Qdrant gRPC | AI stack | LAN/Tailscale/NAS only |
| `8080` | CRM nginx inside container or mapped Caddy HTTP | app host | local/proxy only |
| `8081` | Timeclock nginx inside container | Docker network | proxy only |
| `8088` | AI chunker | AI stack | NAS/Tailscale only |
| `8443` | Caddy HTTPS mapped port when DSM owns `443` | app host/NAS | DSM nginx upstream/local LAN |
| `11434` | Ollama | AI stack | NAS/Tailscale only |
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
