# Service Registry

Last updated: 2026-05-27

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

## Production Services

| Service | Container/process | Owner host | Dependencies | Purpose |
|---|---|---|---|---|
| JoinerFlow API | `joinerflow-server` | `Data` / `192.168.1.32` | SQLite path, filesystem, staged PostgreSQL, optional AI endpoints | API, auth, business data owner, indexing orchestration |
| CRM frontend | `joinerflow-client` | `Data` / `192.168.1.32` | API through reverse proxy | Main CRM UI |
| Timeclock frontend | `joinerflow-clock-client` | `Data` / `192.168.1.32` | API through reverse proxy | Staff timeclock UI |
| Reverse proxy | `joinerflow-proxy` / Caddy | `Data` / `192.168.1.32` | API and frontend health | HTTP/S routing |
| PostgreSQL | `joinerflow-postgres` | `Data` / `192.168.1.32` | `/volume1/docker/postgres` | Staged shadow/parity database exposed on `127.0.0.1:15432` |
| Qdrant | AI host service | `192.168.1.40` configured | persistent vector storage | Vector search; timed out from NAS during 2026-05-27 check |
| Ollama | AI host service | `192.168.1.40` configured | model storage | Local LLM and embeddings; timed out from NAS during 2026-05-27 check |
| AI chunker | `joinerflow-ai-chunker.service` | `192.168.1.40` configured | Python/systemd | CPU chunking offload; health responded during 2026-05-27 check |
| Pi-hole | REQUIRES VALIDATION | planned VM/service | LAN DNS | Internal DNS |
| Backups | `backup-joinerflow.sh`, app managed backups | NAS/app server | storage and DB paths | Backup snapshots |

## Docker Compose Source

Primary Synology compose file:

```text
deployment/synology/docker/docker-compose.prod.yml
```

Optional AI sidecar:

```text
deployment/synology/docker/docker-compose.ai.yml
```

The production compose file still contains local `qdrant` and `ollama` services as a fallback. The current running production container list does not include the local NAS AI containers; the server is configured to call the AI host at `192.168.1.40`.

## Startup Dependencies

```text
postgres -> joinerflow-server -> joinerflow-client/joinerflow-clock-client -> caddy
remote AI endpoints -> joinerflow-server AI health, search, embeddings
```

Current production uses `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; local NAS AI containers should only be started intentionally as a fallback.

## Health Checks

| Check | Command |
|---|---|
| API | `curl -fsS http://127.0.0.1:4000/health` |
| API via proxy | `curl -k https://crm.millbrookfurniture.co.nz/api/health` |
| AI diagnostics | `deployment/synology/scripts/check-ai.sh` |
| Stack health | `deployment/synology/scripts/check-health.sh` |
| Backups | `deployment/synology/scripts/check-backups.sh` |
