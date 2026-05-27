# AI Setup (Remote AI Stack + JoinerFlow)

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

## Objective

Configure local AI inference for JoinerFlow with the intended remote AI VM/container stack and deterministic safety controls. The older Synology-local Ollama/Qdrant path remains a fallback only.

## AI Runtime Components

- `ollama` service for local model serving on the AI stack.
- `qdrant` service for semantic vector retrieval on the AI stack.
- `joinerflow-ai-chunker.service` for deterministic chunking offload.
- JoinerFlow AI endpoints (`/api/ai/health`, `/api/ai/search`, similar entity APIs).
- SQLite-backed deterministic fallback plus Qdrant-backed semantic search.

## Required Models

- General AI assistant: `gemma3:4b`
- Fast utility tasks: `phi4-mini:latest`
- Document embeddings: `nomic-embed-text:latest`

The application currently supports three model roles: primary, fast, and embedding. It does not have a separate coding/refactoring model role; do not install `qwen2.5-coder:7b` unless application support for a fourth role is added.

## Configure AI Environment

Edit `deployment/synology/env/.env.ai`:

```env
AI_ENABLED=true
OLLAMA_BASE_URL=http://192.168.1.40:11434
OLLAMA_PRIMARY_MODEL=gemma3:4b
OLLAMA_FAST_MODEL=phi4-mini:latest
OLLAMA_EMBED_MODEL=nomic-embed-text:latest
QDRANT_URL=http://192.168.1.40:6333
QDRANT_COLLECTION_ENTITIES=entity_embeddings
QDRANT_COLLECTION_KNOWLEDGE=knowledge_chunks
QDRANT_REQUEST_TIMEOUT_MS=8000
AI_CHUNKER_URL=http://192.168.1.40:8088
AI_CHUNKER_TIMEOUT_MS=30000
AI_REQUEST_TIMEOUT_MS=90000
AI_REQUEST_RETRIES=1
AI_RATE_LIMIT_MAX=60
AI_RATE_LIMIT_WINDOW_MS=60000
AI_VECTOR_QUEUE_MAX=5000
AI_EMBED_QUEUE_MAX=5000
AI_EMBED_QUEUE_DELAY_MS=800
AI_KNOWLEDGE_QUEUE_MAX=15000
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=2
OLLAMA_KEEP_ALIVE=24h
```

These limits keep CPU inference predictable. The target AI allocation is 10 GB dedicated to the AI VM/container stack. The exact AI host IP and storage paths REQUIRES VALIDATION after the Proxmox `PVE` target address is in service.

AI knowledge indexing can browse the configured upload/import roots and valid Synology shared folders discovered under `/volume1/*`. The server canonicalizes paths, blocks traversal and symlink escapes, hides system/hidden mounts, and only exposes directories readable by the container.

## Install and Validate Models

On the AI host, install the required models:

```bash
ollama pull gemma3:4b
ollama pull phi4-mini:latest
ollama pull nomic-embed-text:latest
```

From the NAS/app host, validate the configured endpoints:

```bash
sudo ./deployment/synology/scripts/check-ai.sh
```

The NAS `install-ollama-models.sh` script is only for the legacy NAS-local Ollama fallback. It skips model installation when `OLLAMA_BASE_URL` points at a remote AI endpoint.

Validation includes:

- Ollama health endpoint response.
- Model presence in `/api/tags`.
- Text generation request.
- Embedding request.
- Qdrant health endpoint response (`/healthz`).

`/api/ai/health` is an authenticated admin API. The script also checks unauthenticated `/api/health`, direct Ollama, and direct Qdrant endpoints.

## Operational Safety Controls

1. AI can be disabled with `AI_ENABLED=false`.
2. AI failures do not block core CRM startup.
3. AI request rate limits enforced by server runtime (`AI_RATE_LIMIT_*`).
4. Structured output validation remains server-side and deterministic.
5. Embedding/indexing runs through queueing paths rather than direct mutation.

## Model Maintenance

Update model tags in `env/.env.ai`, install them on the AI host, then run:

```bash
sudo ./deployment/synology/restart-joinerflow-synology.sh
sudo ./deployment/synology/scripts/check-ai.sh
```

If using the legacy NAS-local fallback and storage pressure is high, remove old model blobs from:

```text
/volume1/joinerflow/ai/models
```

and re-run install script.
