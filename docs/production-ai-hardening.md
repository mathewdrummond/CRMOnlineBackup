# Production AI Hardening

JoinerFlow AI features are staged by default. Document drafts, import suggestions, operational risks, and labour warnings are advisory outputs; they do not send documents, approve quotes, mutate workflow states, or modify financial totals.

## Runtime Safety

- AI startup validation is exposed through `/api/ai/health` under `diagnostics.startup`.
- Ollama outages are isolated to the AI request path. Core CRM routes continue to run when local inference is offline.
- Structured AI output is schema validated before use. Deterministic import, document, labour, and operations helpers avoid free-form commits.
- AI HTTP calls use request timeouts and abort controllers.
- Embeddings fall back to deterministic local vectors when embedding inference fails.
- Queue state is visible for embeddings and knowledge indexing from the admin System page.
- Vector index integrity checks report corrupt vectors and dimension mismatches.

## Admin Diagnostics

Open `System -> AI Diagnostics` to review:

- Ollama base URL, models, timeout and retry settings
- AI startup configuration warnings
- process and system memory pressure
- embedding queue depth
- knowledge indexing queue depth
- vector index integrity and rebuild readiness
- knowledge source statistics

## Recovery Procedures

1. If Ollama is offline, confirm the container or service is running and verify `OLLAMA_BASE_URL`.
2. If vector integrity reports corrupt rows, run the knowledge reindex action or embedding backfill.
3. If queues are stuck in `processing`, restart the server and rerun the relevant indexing job.
4. Before major AI changes, create a managed backup snapshot from the System page.
5. After restore, rerun AI health diagnostics to confirm queues and indexes are compatible with the restored database.

## Production Validation

Run these before shipping AI changes:

```bash
npm test
npm run test:coverage
npm run test:e2e
npm run test:visual
npm run build:release
npm run preflight:prod
```

Environment-specific failures in `preflight:prod` should be treated separately from code regressions. On Synology/DS225+, expected checks include volume paths, production ports, Docker Compose validation, and Ollama availability.

