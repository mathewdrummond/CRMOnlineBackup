# Synology Troubleshooting Guide

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

## 1. Preflight Fails

Run:

```bash
sudo ./deployment/synology/scripts/preflight-synology.sh
```

Common failures:

1. `Container Manager` not installed.
2. Docker daemon not reachable.
3. Paths not writable under `/volume1/joinerflow`.
4. `PUBLIC_API_ORIGIN` not HTTPS.
5. Required ports already in use.

## 2. Server Container Unhealthy

Run:

```bash
sudo /usr/local/bin/docker logs joinerflow-server --tail 200
sudo ./deployment/synology/scripts/check-health.sh
```

Common causes:

1. Invalid production env values.
2. `SQLITE_PATH` not absolute or not writable.
3. `FILESYSTEM_ROOT` missing or not writable.

## 3. Ollama or AI Failures

Run:

```bash
sudo ./deployment/synology/scripts/check-ai.sh
```

If `OLLAMA_BASE_URL` or `QDRANT_URL` points to `ai.millbrook` or another remote AI host, check the AI host service logs instead of NAS-local Docker logs. Use `sudo /usr/local/bin/docker logs ollama --tail 200` only when the legacy NAS-local fallback is intentionally enabled.

Common causes:

1. Model pull incomplete.
2. Insufficient RAM for concurrent model loading.
3. Incorrect `OLLAMA_BASE_URL`.
4. Remote AI host unreachable over LAN/Tailscale.
5. Chunker allowlist missing the active NAS/app-server source IP.
6. Model directory permission issue under `/volume1/joinerflow/ai/models` when using NAS-local fallback.
7. Qdrant data directory issue under `/volume1/vector-data/qdrant` when using NAS-local fallback.

Mitigation:

1. Keep `OLLAMA_NUM_PARALLEL=1`.
2. Keep `OLLAMA_MAX_LOADED_MODELS` low enough for the AI host memory allocation.
3. Keep only the active model set installed: `gemma3:4b`, `phi4-mini:latest`, and `nomic-embed-text:latest`.
4. Restart Ollama on the AI host and reinstall models if needed.

## 4. Backup Validation Fails

Run:

```bash
sudo ./deployment/synology/scripts/check-backups.sh
```

Common causes:

1. Interrupted backup job.
2. Insufficient backup disk space.
3. Missing snapshot components.

Fix:

1. Create a fresh backup.
2. Verify `BACKUP_ROOT` path permissions.
3. Check disk capacity with `check-storage.sh`.

## 5. High Storage or Memory Pressure

Run:

```bash
./deployment/synology/scripts/check-storage.sh
sudo /usr/local/bin/docker stats --no-stream
```

Actions:

1. Purge old backups per retention policy.
2. Remove unused Ollama models on the AI host or disable the legacy NAS-local fallback.
3. Disable optional AI sidecar (`open-webui`) and keep core Qdrant + Ollama only.

## 6. Full Service Recovery

1. Stop stack:

```bash
sudo ./deployment/synology/stop-joinerflow-synology.sh
```

2. Restore last known good snapshot:

```bash
sudo ./deployment/synology/scripts/restore-joinerflow.sh /volume1/joinerflow/backups/snapshot-YYYYMMDD-HHMMSS
```

3. Re-run diagnostics:

```bash
sudo ./deployment/synology/scripts/check-health.sh
sudo ./deployment/synology/scripts/check-ai.sh
sudo ./deployment/synology/scripts/check-storage.sh
```

## 7. Update Procedure

1. Pull latest repository changes.
2. Re-run install flow:

```bash
sudo ./deployment/synology/install-joinerflow.sh
```

3. Confirm health and backups.

## 8. Rollback Procedure

1. Select snapshot created before update.
2. Execute restore script.
3. Validate with health scripts.
