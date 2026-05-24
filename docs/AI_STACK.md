# AI Stack

Last updated: 2026-05-24

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

The current AI host IP, VM ID, and storage paths REQUIRES VALIDATION after migration to Proxmox `PVE` at `192.168.1.99`.

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
OLLAMA_BASE_URL=http://<ai-host>:11434
QDRANT_URL=http://<ai-host>:6333
AI_CHUNKER_URL=http://<ai-host>:8088
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
