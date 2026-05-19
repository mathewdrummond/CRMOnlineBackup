#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files
require_cmd docker
require_cmd jq
require_cmd curl

if ! is_true "${AI_ENABLED:-true}"; then
  log_warn "AI_ENABLED is false; skipping Ollama model installation."
  exit 0
fi

models=(
  "${OLLAMA_PRIMARY_MODEL:-gemma3:4b}"
  "${OLLAMA_FAST_MODEL:-phi4-mini:latest}"
  "${OLLAMA_EMBED_MODEL:-nomic-embed-text:latest}"
)

log_info "Ensuring Ollama container is running."
compose_prod up -d ollama

for i in {1..20}; do
  if curl -fsS "http://127.0.0.1:${JOINERFLOW_OLLAMA_PORT:-11434}/api/tags" >/dev/null 2>&1; then
    break
  fi
  sleep 3
done

if ! curl -fsS "http://127.0.0.1:${JOINERFLOW_OLLAMA_PORT:-11434}/api/tags" >/dev/null 2>&1; then
  log_error "Ollama did not become healthy."
  exit 1
fi

for model in "${models[@]}"; do
  log_info "Pulling model: ${model}"
  compose_prod exec -T ollama ollama pull "${model}"
done

tags_json="$(curl -fsS "http://127.0.0.1:${JOINERFLOW_OLLAMA_PORT:-11434}/api/tags")"
for model in "${models[@]}"; do
  if printf '%s' "$tags_json" | jq -e --arg model "$model" 'any(.models[]?; .name == $model)' >/dev/null 2>&1; then
    log_info "Model installed: ${model}"
  else
    log_error "Model missing after pull: ${model}"
    exit 1
  fi
done

log_info "Validating inference and embeddings."
curl -fsS "http://127.0.0.1:${JOINERFLOW_OLLAMA_PORT:-11434}/api/generate" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"${OLLAMA_PRIMARY_MODEL:-gemma3:4b}\",\"prompt\":\"Reply with OK only\",\"stream\":false}" >/dev/null
curl -fsS "http://127.0.0.1:${JOINERFLOW_OLLAMA_PORT:-11434}/api/generate" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"${OLLAMA_FAST_MODEL:-phi4-mini:latest}\",\"prompt\":\"Reply with OK only\",\"stream\":false}" >/dev/null
curl -fsS "http://127.0.0.1:${JOINERFLOW_OLLAMA_PORT:-11434}/api/embeddings" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"${OLLAMA_EMBED_MODEL:-nomic-embed-text:latest}\",\"prompt\":\"JoinerFlow embedding test\"}" | jq -e '.embedding and (.embedding | length > 0)' >/dev/null

log_info "Ollama model installation complete."
