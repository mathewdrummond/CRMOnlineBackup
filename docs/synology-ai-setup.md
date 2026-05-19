# Synology AI Setup (Ollama + JoinerFlow)

## Objective

Configure local AI inference for JoinerFlow on Synology with CPU-friendly settings and deterministic safety controls.

## AI Runtime Components

- `ollama` container for local model serving.
- `qdrant` container for semantic vector retrieval.
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
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_PRIMARY_MODEL=gemma3:4b
OLLAMA_FAST_MODEL=phi4-mini:latest
OLLAMA_EMBED_MODEL=nomic-embed-text:latest
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION_ENTITIES=entity_embeddings
QDRANT_COLLECTION_KNOWLEDGE=knowledge_chunks
QDRANT_REQUEST_TIMEOUT_MS=3000
AI_REQUEST_TIMEOUT_MS=45000
AI_REQUEST_RETRIES=1
AI_RATE_LIMIT_MAX=8
AI_RATE_LIMIT_WINDOW_MS=60000
AI_VECTOR_QUEUE_MAX=5000
AI_EMBED_QUEUE_MAX=5000
AI_EMBED_QUEUE_DELAY_MS=800
AI_KNOWLEDGE_QUEUE_MAX=15000
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_KEEP_ALIVE=10m
```

These limits keep CPU inference predictable. Production currently caps the Ollama container at 8192 MB, which is enough for the listed model set on the upgraded NAS.

AI knowledge indexing can browse the configured upload/import roots and valid Synology shared folders discovered under `/volume1/*`. The server canonicalizes paths, blocks traversal and symlink escapes, hides system/hidden mounts, and only exposes directories readable by the container.

## Install and Validate Models

```bash
sudo ./deployment/synology/scripts/install-ollama-models.sh
sudo ./deployment/synology/scripts/check-ai.sh
```

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

Update model tags in `env/.env.ai`, then run:

```bash
sudo ./deployment/synology/scripts/install-ollama-models.sh
sudo ./deployment/synology/restart-joinerflow-synology.sh
```

If storage pressure is high, remove old model blobs from:

```text
/volume1/joinerflow/ai/models
```

and re-run install script.
