# Production NAS Agent Prompt

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

Use this prompt when asking a coding agent to work directly on the JoinerFlow production NAS.

```text
You are working directly on the JoinerFlow production NAS for Millbrook Furniture.

Production site:
https://crm.millbrookfurniture.co.nz/

Active NAS/app host:
- SSH user: mathew
- Active host: 192.168.1.32
- Historical/failover host: 192.168.1.31, not active/reachable during the 2026-05-27 production check
- Credentials are supplied out of band. Do not write, print, commit, or repeat passwords or secrets.

App source location on NAS:
/volume1/joinerflow-data

Runtime data location on NAS:
/volume1/joinerflow

Important deployment notes:
- Changes should be made directly in /volume1/joinerflow-data on the NAS.
- Do not assume a local workstation or SMB-mounted copy is authoritative.
- Docker requires sudo access for this user.
- Docker is available at /usr/local/bin/docker.
- Docker Compose is available through /usr/local/bin/docker compose.
- Use sudo only for Docker/container operations or other required privileged production tasks.
- After code changes, rebuild and recreate only the affected production containers.
- Use the Synology production compose file:
  deployment/synology/docker/docker-compose.prod.yml
- Use these env files:
  deployment/synology/env/.env.synology
  deployment/synology/env/.env.production
  deployment/synology/env/.env.ai

Current runtime model:
- SQLite is the authoritative production database:
  /volume1/joinerflow/server/joinerflow.sqlite
- DATABASE_DRIVER is sqlite.
- DATABASE_SHADOW_WRITE is true.
- joinerflow-postgres is staged for shadow/future primary use only.
- Do not switch production primary mode to PostgreSQL without explicit migration sign-off.
- AI endpoints are configured at 192.168.1.40. Treat AI health as degraded if Ollama or Qdrant are unreachable.

Typical rebuild command after server and CRM frontend changes:

cd /volume1/joinerflow-data
export PATH=/usr/local/bin:$PATH

sudo /usr/local/bin/docker compose \
  --project-name joinerflow \
  --env-file deployment/synology/env/.env.synology \
  --env-file deployment/synology/env/.env.production \
  --env-file deployment/synology/env/.env.ai \
  -f deployment/synology/docker/docker-compose.prod.yml \
  build joinerflow-server joinerflow-client

sudo /usr/local/bin/docker compose \
  --project-name joinerflow \
  --env-file deployment/synology/env/.env.synology \
  --env-file deployment/synology/env/.env.production \
  --env-file deployment/synology/env/.env.ai \
  -f deployment/synology/docker/docker-compose.prod.yml \
  up -d --no-deps --force-recreate joinerflow-server joinerflow-client

If the standalone timeclock frontend changes, include joinerflow-clock-client in both the build and up commands.

Post-deploy checks:
- Confirm containers are healthy:
  sudo /usr/local/bin/docker ps --filter 'name=joinerflow-' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
- Confirm API health:
  curl -fsS http://127.0.0.1:4000/health
- Confirm the public site serves the current bundle:
  curl -k -s https://crm.millbrookfurniture.co.nz/ | grep assets
- If the timeclock changed, confirm the timeclock route through the configured hostname.

Important NAS build caveat:
- Host-side npm builds may fail because node_modules/.bin launchers can be broken by SMB/macOS symlink encoding.
- Prefer rebuilding through Docker where possible.
- If frontend assets need to be regenerated outside Docker, repair or reinstall dependencies on the NAS first, then run the build on the NAS.

Safety requirements:
- Do not print or expose credentials in final responses, logs, docs, commits, or shell output summaries.
- Do not run destructive git or filesystem commands unless explicitly requested.
- Do not run database writes until you have identified the exact record, taken an appropriate backup if risk warrants it, and have a rollback path.
- Do not expose SSH, Docker, PostgreSQL, Qdrant, Ollama, AI chunker, or raw API ports to the WAN.
- Preserve user data and existing unrelated changes.
- Document any infrastructure, deployment, port, domain, backup, or runtime-path change in /docs.

Before finishing:
- Summarize the production files changed.
- Summarize the containers rebuilt or state that no rebuild was needed.
- Summarize the health checks performed.
- Mention any known degraded service, especially AI endpoint health.
- Do not include passwords or secrets.
```
