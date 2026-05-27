# AI Stack

Last updated: 2026-05-27

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

## Target

The intended AI stack is separate from the NAS application workload and has a reduced dedicated allocation target of 10 GB RAM.

| Component | Target |
|---|---|
| Runtime host | AI services VM/container stack on Proxmox |
| RAM allocation | 10 GB dedicated AI allocation |
| Vector database | Qdrant |
| Local inference | Ollama |
| Embeddings | `nomic-embed-text:latest`, 768 dimensions |
| Fast model | `phi4-mini:latest` |
| Primary model | `gemma3:4b` |
| Chunking | `joinerflow-ai-chunker.service` |
| Cold-start mitigation | Ollama warmup timer or equivalent |

The current server configuration points AI traffic at `192.168.1.40`. During the 2026-05-27 check, the NAS reached the chunker health endpoint on `192.168.1.40:8088`, while Ollama `11434` and Qdrant `6333` timed out. Treat Ollama/Qdrant health as an open operational item before relying on AI search or model responses.

## Data Flow

1. JoinerFlow API scans allowed Synology paths.
2. API extracts text and sends it to the chunker if `AI_CHUNKER_URL` is configured.
3. Chunker returns deterministic chunks.
4. API requests embeddings from Ollama.
5. API writes vector points to Qdrant.
6. API keeps authoritative metadata in SQLite/PostgreSQL-owned tables.
7. Search retrieves business records and vector context, then optionally asks Ollama for an answer.

## Required Environment

```text
AI_ENABLED=true
OLLAMA_BASE_URL=http://192.168.1.40:11434
QDRANT_URL=http://192.168.1.40:6333
AI_CHUNKER_URL=http://192.168.1.40:8088
OLLAMA_PRIMARY_MODEL=gemma3:4b
OLLAMA_FAST_MODEL=phi4-mini:latest
OLLAMA_EMBED_MODEL=nomic-embed-text:latest
QDRANT_COLLECTION_ENTITIES=entity_embeddings
QDRANT_COLLECTION_KNOWLEDGE=knowledge_chunks
```

## Operational Rules

- Do not wipe Qdrant collections without a backup or a documented rebuild path.
- Keep AI service ports LAN/Tailscale only.
- Keep the chunker allowlist aligned with the active NAS/app server source IP.
- Do not mount the live SQLite database read/write into the AI host.
- If indexing moves fully to the AI host, use an API/queue boundary or complete the PostgreSQL ownership migration first.

## Validation

```bash
curl -fsS "$OLLAMA_BASE_URL/api/tags"
curl -fsS "$QDRANT_URL/healthz"
curl -fsS "$AI_CHUNKER_URL/health"
deployment/synology/scripts/check-ai.sh
```
