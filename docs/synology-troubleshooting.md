# Synology Troubleshooting Guide

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
sudo /usr/local/bin/docker logs ollama --tail 200
sudo ./deployment/synology/scripts/check-ai.sh
```

Common causes:

1. Model pull incomplete.
2. Insufficient RAM for concurrent model loading.
3. Incorrect `OLLAMA_BASE_URL`.
4. Model directory permission issue under `/volume1/joinerflow/ai/models`.
5. Qdrant data directory issue under `/volume1/vector-data/qdrant`.

Mitigation:

1. Keep `OLLAMA_NUM_PARALLEL=1`.
2. Keep `OLLAMA_MAX_LOADED_MODELS=1`.
3. Keep only the active model set installed: `gemma3:4b`, `phi4-mini:latest`, and `nomic-embed-text:latest`.
4. Restart Ollama and reinstall models.

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
2. Remove unused Ollama models.
3. Disable optional AI sidecar (`open-webui`) and keep core `qdrant` + `ollama` only.

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
