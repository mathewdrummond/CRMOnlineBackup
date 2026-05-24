#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

OVERWRITE=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --overwrite)
      OVERWRITE=true
      ;;
    *)
      log_error "Unknown argument: $1"
      exit 1
      ;;
  esac
  shift
done

load_env_files

TARGET_FILE="${ENV_DIR}/.env.production"
touch "$TARGET_FILE"

extract_host() {
  local origin="$1"
  origin="${origin#http://}"
  origin="${origin#https://}"
  origin="${origin%%/*}"
  origin="${origin%%:*}"
  printf '%s' "$origin"
}

upsert_default_env() {
  local key="$1"
  local value="$2"

  if [ -z "$value" ]; then
    return
  fi

  if grep -q "^${key}=" "$TARGET_FILE" 2>/dev/null; then
    if [ "$OVERWRITE" = true ]; then
      sed -i'' -e "s#^${key}=.*#${key}=${value}#g" "$TARGET_FILE"
      log_info "Updated ${key} in .env.production"
    fi
    return
  fi

  printf '\n%s=%s\n' "$key" "$value" >> "$TARGET_FILE"
  log_info "Added ${key} to .env.production"
}

public_origin="${JOINERFLOW_PUBLIC_ORIGIN:-https://crm.millbrookfurniture.co.nz}"
clock_origin="${JOINERFLOW_TIMECLOCK_ORIGIN:-https://clock.joinerflow.local}"
public_host="$(extract_host "$public_origin")"
clock_host="$(extract_host "$clock_origin")"
install_root="${JOINERFLOW_INSTALL_ROOT:-/volume1/joinerflow}"
server_port="${JOINERFLOW_SERVER_PORT:-4000}"

upsert_default_env "NODE_ENV" "production"
upsert_default_env "HOST" "0.0.0.0"
upsert_default_env "PORT" "${server_port}"
upsert_default_env "PUBLIC_API_ORIGIN" "${public_origin}"
upsert_default_env "ALLOWED_HOSTS" "${public_host},${clock_host},joinerflow.local,clock.joinerflow.local,timeclock.millbrookfurniture.co.nz"
upsert_default_env "CORS_ORIGIN" "${public_origin},${clock_origin},https://joinerflow.local,https://clock.joinerflow.local,https://timeclock.millbrookfurniture.co.nz"

upsert_default_env "SQLITE_PATH" "${install_root}/server/joinerflow.sqlite"
upsert_default_env "FILESYSTEM_ROOT" "${install_root}/filesystem"
upsert_default_env "BACKUP_ROOT" "${install_root}/backups"
upsert_default_env "LOG_DIRECTORY" "${install_root}/logs"

upsert_default_env "DATABASE_DRIVER" "sqlite"
upsert_default_env "DATABASE_SHADOW_WRITE" "true"
upsert_default_env "DATABASE_URL" "postgresql://joinerflow:joinerflow@postgres:5432/joinerflow"
upsert_default_env "PGHOST" "postgres"
upsert_default_env "PGPORT" "5432"
upsert_default_env "PGDATABASE" "joinerflow"
upsert_default_env "PGUSER" "joinerflow"
upsert_default_env "PGPASSWORD" "joinerflow"
upsert_default_env "PGPOOL_MAX" "8"
upsert_default_env "PGPOOL_IDLE_TIMEOUT_MS" "30000"
upsert_default_env "PGPOOL_CONNECTION_TIMEOUT_MS" "10000"

upsert_default_env "AI_ENABLED" "${AI_ENABLED:-true}"
upsert_default_env "OLLAMA_BASE_URL" "${OLLAMA_BASE_URL:-http://ai.millbrook:11434}"
upsert_default_env "OLLAMA_PRIMARY_MODEL" "${OLLAMA_PRIMARY_MODEL:-gemma3:4b}"
upsert_default_env "OLLAMA_FAST_MODEL" "${OLLAMA_FAST_MODEL:-phi4-mini:latest}"
upsert_default_env "OLLAMA_EMBED_MODEL" "${OLLAMA_EMBED_MODEL:-nomic-embed-text:latest}"
upsert_default_env "QDRANT_URL" "${QDRANT_URL:-http://ai.millbrook:6333}"
upsert_default_env "QDRANT_COLLECTION_ENTITIES" "${QDRANT_COLLECTION_ENTITIES:-entity_embeddings}"
upsert_default_env "QDRANT_COLLECTION_KNOWLEDGE" "${QDRANT_COLLECTION_KNOWLEDGE:-knowledge_chunks}"
upsert_default_env "QDRANT_API_KEY" "${QDRANT_API_KEY:-}"
upsert_default_env "QDRANT_REQUEST_TIMEOUT_MS" "${QDRANT_REQUEST_TIMEOUT_MS:-3000}"
upsert_default_env "AI_REQUEST_TIMEOUT_MS" "${AI_REQUEST_TIMEOUT_MS:-45000}"
upsert_default_env "AI_REQUEST_RETRIES" "${AI_REQUEST_RETRIES:-1}"
upsert_default_env "AI_RATE_LIMIT_MAX" "${AI_RATE_LIMIT_MAX:-8}"
upsert_default_env "AI_RATE_LIMIT_WINDOW_MS" "${AI_RATE_LIMIT_WINDOW_MS:-60000}"
upsert_default_env "AI_CHUNKER_URL" "${AI_CHUNKER_URL:-http://ai.millbrook:8088}"
upsert_default_env "AI_CHUNKER_TIMEOUT_MS" "${AI_CHUNKER_TIMEOUT_MS:-30000}"
upsert_default_env "AI_KNOWLEDGE_MAX_CONCURRENT" "${AI_KNOWLEDGE_MAX_CONCURRENT:-1}"
upsert_default_env "AI_VECTOR_QUEUE_MAX" "${AI_VECTOR_QUEUE_MAX:-5000}"
upsert_default_env "AI_EMBED_QUEUE_MAX" "${AI_EMBED_QUEUE_MAX:-5000}"
upsert_default_env "AI_EMBED_QUEUE_DELAY_MS" "${AI_EMBED_QUEUE_DELAY_MS:-800}"
upsert_default_env "AI_KNOWLEDGE_QUEUE_MAX" "${AI_KNOWLEDGE_QUEUE_MAX:-15000}"
upsert_default_env "AI_KNOWLEDGE_ALLOWED_ROOTS" "${AI_KNOWLEDGE_ALLOWED_ROOTS:-${install_root}/filesystem,${install_root}/imports}"
upsert_default_env "JOINERFLOW_ENABLE_OPEN_WEBUI" "${JOINERFLOW_ENABLE_OPEN_WEBUI:-false}"

upsert_default_env "TRUST_PROXY" "true"
upsert_default_env "AUTH_SECURE_COOKIE" "true"
upsert_default_env "AUTH_SESSION_TTL_HOURS" "12"
upsert_default_env "MAX_REQUEST_BODY_SIZE_MB" "100"
upsert_default_env "DIAGNOSTICS_RETENTION_DAYS" "14"
upsert_default_env "BACKUP_RETENTION_DAYS" "60"

log_info "Production env defaults synchronized from lower env configuration (${OVERWRITE:+overwrite=${OVERWRITE}})."
