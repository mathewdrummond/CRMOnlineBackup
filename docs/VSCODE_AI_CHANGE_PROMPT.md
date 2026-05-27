# VS Code AI Change Prompt

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

Use this prompt when asking a VS Code AI assistant, Copilot Chat, or another coding agent to make changes to JoinerFlow or the Millbrook infrastructure repository.

```text
You are working on the JoinerFlow platform for Millbrook.

Repository location:
/Volumes/joinerflow-data

Primary goal:
Make focused, production-safe changes while preserving the current Millbrook deployment architecture and operational documentation.

Current target infrastructure:
- Proxmox VE host: PVE, target IP 192.168.1.99
- Synology NAS: Data, IP 192.168.1.32
- Primary CRM domain: crm.millbrookfurniture.co.nz
- Local CRM alias: joinerflow.local
- Local timeclock alias: clock.joinerflow.local
- Remote access: Tailscale mesh VPN
- AI stack: Proxmox-hosted AI VM/container stack, exact AI host IP requires validation
- AI target allocation: 10 GB dedicated AI memory
- Primary data store: SQLite remains authoritative
- PostgreSQL: staged/shadow/future primary only
- AI services: Ollama, Qdrant, and joinerflow-ai-chunker are assistive and must not directly own business writes

Canonical docs to read before infrastructure or deployment changes:
- docs/INFRASTRUCTURE_OVERVIEW.md
- docs/NETWORK_ARCHITECTURE.md
- docs/SERVICES.md
- docs/PORT_REGISTRY.md
- docs/AI_STACK.md
- docs/DEPLOYMENT_GUIDE.md
- docs/DISASTER_RECOVERY.md
- docs/SCRIPT_REGISTRY.md
- docs/millbrook-infrastructure-current-state.md
- docs/INFRASTRUCTURE_AUDIT_2026-05-24.md

Important deployment locations:
- deployment/synology/docker/docker-compose.prod.yml
- deployment/synology/docker/docker-compose.ai.yml
- deployment/synology/caddy/Caddyfile
- deployment/synology/env/*.example
- deployment/synology/scripts/
- deployment/ai/chunker/
- deploy/
- scripts/

Important Synology runtime paths:
- /volume1/joinerflow
- /volume1/joinerflow/server/joinerflow.sqlite
- /volume1/joinerflow/filesystem
- /volume1/joinerflow/imports
- /volume1/joinerflow/backups
- /volume1/joinerflow/logs
- /volume1/archive
- /volume1/joinerflow-data

Core service model:
- joinerflow-server owns API, auth, business state, SQLite writes, indexing orchestration, and health checks.
- joinerflow-client serves the CRM frontend.
- joinerflow-clock-client serves the timeclock frontend.
- joinerflow-proxy/Caddy routes CRM, local aliases, timeclock, API, and filesystem traffic.
- joinerflow-postgres is staged for shadow/future primary operation.
- Ollama, Qdrant, and the AI chunker should normally run on the remote AI stack, not the NAS.
- Legacy NAS-local Ollama/Qdrant fallback exists in compose and scripts, but should only be used deliberately.

Safety rules:
- Do not expose Proxmox, SSH, RDP, Qdrant, Ollama, AI chunker, PostgreSQL, or raw API ports directly to the WAN.
- Do not change DATABASE_DRIVER to postgres for production primary mode unless the repository migration work is complete and documented.
- Do not mount the live SQLite database read/write into the AI host.
- Do not wipe Qdrant collections without a snapshot or documented rebuild path.
- Do not commit live secrets, passwords, tokens, cookie secrets, Google credentials, or Tailscale keys.
- Before destructive data work, create a backup and document the rollback path.
- Preserve historical notes unless clearly obsolete; if uncertain, mark REQUIRES VALIDATION.

Required validation after deployment/script changes:
- Run shell syntax checks for changed .sh files:
  for f in deployment/synology/*.sh deployment/synology/scripts/*.sh deployment/synology/scripts/lib/*.sh deploy/linux/*.sh; do bash -n "$f" || exit 1; done
- Validate compose config:
  docker compose --env-file deployment/synology/env/synology.example --env-file deployment/synology/env/production.example --env-file deployment/synology/env/ai.example -f deployment/synology/docker/docker-compose.prod.yml config
  docker compose --env-file deployment/synology/env/synology.example --env-file deployment/synology/env/production.example --env-file deployment/synology/env/ai.example -f deployment/synology/docker/docker-compose.prod.yml -f deployment/synology/docker/docker-compose.ai.yml --profile ai-optional config
- For application code changes, run the relevant tests from package.json before finishing.

Expected documentation behavior:
- Update docs whenever infrastructure, ports, domains, paths, scripts, deployment order, or backup behavior changes.
- Prefer updating existing docs over creating duplicates.
- Keep links between markdown files valid.
- Add REQUIRES VALIDATION for facts that cannot be confirmed locally.

Change style:
- Make small, reviewable changes.
- Follow existing code and script patterns.
- Prefer safe defaults and idempotent script behavior.
- Explain operational impact and rollback notes in the final response.
```
