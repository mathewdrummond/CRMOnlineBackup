#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files
require_cmd curl
require_cmd jq
require_cmd docker

if ! is_true "${AI_ENABLED:-true}"; then
  log_warn "AI_ENABLED is false; skipping AI diagnostics."
  exit 0
fi

log_info "AI service diagnostics"
compose_prod ps ollama joinerflow-server
if is_true "${JOINERFLOW_ENABLE_OPEN_WEBUI:-false}"; then
  compose_ai --profile ai-optional ps || true
fi

tags="$(curl -fsS "http://127.0.0.1:${JOINERFLOW_OLLAMA_PORT:-11434}/api/tags")"
printf '%s\n' "$tags" | jq .

ai_health="$(curl -fsS "http://127.0.0.1:${JOINERFLOW_SERVER_PORT:-4000}/api/ai/health" || true)"
if [ -n "$ai_health" ]; then
  printf '%s\n' "$ai_health" | jq .
fi

api_health="$(curl -fsS "http://127.0.0.1:${JOINERFLOW_SERVER_PORT:-4000}/api/health" || true)"
if [ -n "$api_health" ]; then
  printf '%s\n' "$api_health" | jq '.ai? // {}'
fi

curl -fsS "http://127.0.0.1:${JOINERFLOW_QDRANT_PORT:-6333}/healthz" >/dev/null

curl -fsS "http://127.0.0.1:${JOINERFLOW_OLLAMA_PORT:-11434}/api/generate" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"${OLLAMA_FAST_MODEL:-phi4-mini:latest}\",\"prompt\":\"Reply with OK only\",\"stream\":false}" >/tmp/joinerflow-ai-generate.json
curl -fsS "http://127.0.0.1:${JOINERFLOW_OLLAMA_PORT:-11434}/api/embeddings" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"${OLLAMA_EMBED_MODEL:-nomic-embed-text:latest}\",\"prompt\":\"synology embedding check\"}" >/tmp/joinerflow-ai-embed.json

if is_true "${JOINERFLOW_ENABLE_OPEN_WEBUI:-false}"; then
  curl -fsS "http://127.0.0.1:${JOINERFLOW_OPEN_WEBUI_PORT:-3001}/health" >/dev/null
fi

log_info "AI inference check completed."
