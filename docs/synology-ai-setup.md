# Synology AI Setup (Ollama + JoinerFlow)

## Objective

Configure local AI inference for JoinerFlow on Synology DS225+ with CPU-friendly settings and deterministic safety controls.

## AI Runtime Components

- `ollama` container for local model serving.
- `qdrant` container for semantic vector retrieval.
- JoinerFlow AI endpoints (`/api/ai/health`, `/api/ai/search`, similar entity APIs).
- SQLite-backed deterministic fallback plus Qdrant-backed semantic search.

## Required Models

- `qwen2.5:3b-instruct-q4_K_M`
- `gemma3:1b`
- `nomic-embed-text`

## Configure AI Environment

Edit `deployment/synology/env/.env.ai`:

```env
AI_ENABLED=true
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_PRIMARY_MODEL=qwen2.5:3b-instruct-q4_K_M
OLLAMA_FAST_MODEL=gemma3:1b
OLLAMA_EMBED_MODEL=nomic-embed-text
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

These limits keep AI throughput stable on low-memory NAS hardware.

## Install and Validate Models

```bash
./deployment/synology/scripts/install-ollama-models.sh
./deployment/synology/scripts/check-ai.sh
```

Validation includes:

- Ollama health endpoint response.
- Model presence in `/api/tags`.
- Text generation request.
- Embedding request.
- Qdrant health endpoint response (`/healthz`).

## Operational Safety Controls

1. AI can be disabled with `AI_ENABLED=false`.
2. AI failures do not block core CRM startup.
3. AI request rate limits enforced by server runtime (`AI_RATE_LIMIT_*`).
4. Structured output validation remains server-side and deterministic.
5. Embedding/indexing runs through queueing paths rather than direct mutation.

## Model Maintenance

Update model tags in `env/.env.ai`, then run:

```bash
./deployment/synology/scripts/install-ollama-models.sh
./deployment/synology/restart-joinerflow-synology.sh
```

If storage pressure is high, remove old model blobs from:

```text
/volume1/joinerflow/ai/models
```

and re-run install script.
