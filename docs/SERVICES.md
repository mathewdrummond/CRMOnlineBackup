# Service Registry

Last updated: 2026-05-24

## Production Services

| Service | Container/process | Owner host | Dependencies | Purpose |
|---|---|---|---|---|
| JoinerFlow API | `joinerflow-server` | app server/NAS | PostgreSQL, SQLite path, filesystem, optional AI endpoints | API, auth, business data owner, indexing orchestration |
| CRM frontend | `joinerflow-client` | app server/NAS | API through reverse proxy | Main CRM UI |
| Timeclock frontend | `joinerflow-clock-client` | app server/NAS | API through reverse proxy | Staff timeclock UI |
| Reverse proxy | `joinerflow-proxy` / Caddy | app server/NAS | API and frontend health | HTTP/S routing |
| PostgreSQL | `joinerflow-postgres` | app server/NAS | persistent data volume | Staged shadow/parity database |
| Qdrant | `joinerflow-qdrant` | AI stack target | persistent vector storage | Vector search |
| Ollama | `ollama` | AI stack target | model storage | Local LLM and embeddings |
| AI chunker | `joinerflow-ai-chunker.service` | AI stack target | Python/systemd | CPU chunking offload |
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

The production compose file still contains local `qdrant` and `ollama` services as a fallback. Current intended architecture should use remote AI endpoints from the AI stack unless explicitly deploying all services on the NAS.

## Startup Dependencies

```text
postgres -> joinerflow-server -> joinerflow-client/joinerflow-clock-client -> caddy
remote AI endpoints -> joinerflow-server AI health, search, embeddings
```

If `OLLAMA_BASE_URL=http://ollama:11434` or `QDRANT_URL=http://qdrant:6333`, startup scripts launch the local NAS AI containers. If the URLs point to a remote host, startup skips those local containers.

## Health Checks

| Check | Command |
|---|---|
| API | `curl -fsS http://127.0.0.1:4000/health` |
| API via proxy | `curl -k https://crm.millbrookfurniture.co.nz/api/health` |
| AI diagnostics | `deployment/synology/scripts/check-ai.sh` |
| Stack health | `deployment/synology/scripts/check-health.sh` |
| Backups | `deployment/synology/scripts/check-backups.sh` |
