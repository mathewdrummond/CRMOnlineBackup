# Network Architecture

Last updated: 2026-05-24

## Target Network

| Item | Value |
|---|---|
| LAN subnet | `192.168.1.0/24` |
| Router/gateway | `192.168.1.1` OpenWrt |
| Proxmox host | `PVE`, `192.168.1.99` |
| Synology NAS | `Data`, `192.168.1.32` |
| Remote access | Tailscale mesh VPN |
| Public/raw service exposure | Avoid except through approved reverse proxy |

Historical docs and dated observations may mention `192.168.1.34` for Proxmox and `192.168.1.40` for the AI CT. The target architecture standardizes on Proxmox `192.168.1.99`; current AI host addressing still REQUIRES VALIDATION.

## DNS Records

| Hostname | Target | Status |
|---|---:|---|
| `crm.millbrookfurniture.co.nz` | reverse proxy for JoinerFlow CRM | target production name |
| `joinerflow.local` | local reverse proxy for CRM | target local alias |
| `clock.joinerflow.local` | local reverse proxy for timeclock | target local alias |
| `Data.local` | `192.168.1.32` | Synology mDNS/local name |
| `pve.millbrook` or `PVE` | `192.168.1.99` | REQUIRES VALIDATION in DNS |
| `ai.millbrook` | AI stack address | REQUIRES VALIDATION |
| `pihole.millbrook` | Pi-hole/local DNS | planned |

## Reverse Proxy Pattern

Normal user traffic should flow:

```text
browser -> DNS -> reverse proxy -> JoinerFlow frontend/API containers
```

The supported Synology Docker stack uses Caddy:

```text
80/443 or mapped 8080/8443 -> joinerflow-proxy -> joinerflow-client / joinerflow-clock-client / joinerflow-server
```

When DSM nginx owns port `443`, DSM nginx may proxy to Caddy on `127.0.0.1:8443`. Keep this explicitly documented on the NAS because it changes certificate ownership and troubleshooting steps.

## Remote Access

Tailscale is the preferred remote access path for:

- Proxmox UI and SSH
- Synology DSM and SSH
- Windows admin/workstation VMs
- AI stack maintenance
- Emergency app support

Do not forward these directly from the router:

- Proxmox `8006`
- SSH `22`
- RDP `3389`
- Qdrant `6333/6334`
- Ollama `11434`
- AI chunker `8088`
- JoinerFlow API `4000`

## Validation Commands

```bash
dig crm.millbrookfurniture.co.nz
dig joinerflow.local
dig clock.joinerflow.local
tailscale status
curl -k https://crm.millbrookfurniture.co.nz/api/health
curl -k https://joinerflow.local/api/health
```
