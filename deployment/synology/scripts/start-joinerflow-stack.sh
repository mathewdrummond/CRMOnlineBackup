#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files
require_cmd docker
require_cmd curl
wait_for_docker 60 5

log_info "Starting JoinerFlow core containers."
core_services=(postgres joinerflow-server joinerflow-client joinerflow-clock-client caddy)
if is_true "${AI_ENABLED:-true}"; then
  ai_services=()
  if uses_local_ollama; then
    ai_services+=(ollama)
  fi
  if uses_local_qdrant; then
    ai_services+=(qdrant)
  fi
  if [ "${#ai_services[@]}" -gt 0 ]; then
    compose_prod up -d --remove-orphans "${ai_services[@]}" "${core_services[@]}"
  else
    log_info "AI is enabled with remote endpoints; skipping local NAS Ollama/Qdrant containers."
    compose_prod up -d --remove-orphans "${core_services[@]}"
  fi
else
  compose_prod up -d --remove-orphans "${core_services[@]}"
fi

if is_true "${JOINERFLOW_ENABLE_OPEN_WEBUI:-false}"; then
  log_info "Starting optional AI sidecar containers."
  compose_ai --profile ai-optional up -d open-webui
fi

log_info "Waiting for server health endpoint."
for i in {1..30}; do
  if curl -fsS "http://127.0.0.1:${JOINERFLOW_SERVER_PORT:-4000}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

"${SCRIPT_DIR}/check-health.sh"
if is_true "${AI_ENABLED:-true}" && is_true "${JOINERFLOW_RUN_STARTUP_AI_CHECK:-false}"; then
  ai_check_cmd=("${SCRIPT_DIR}/check-ai.sh")
  if command -v timeout >/dev/null 2>&1; then
    ai_check_cmd=(timeout 120 "${SCRIPT_DIR}/check-ai.sh")
  fi

  if "${ai_check_cmd[@]}"; then
    log_info "AI diagnostics passed."
  else
    log_warn "AI diagnostics failed or timed out; core JoinerFlow services are already running."
  fi
elif is_true "${AI_ENABLED:-true}"; then
  log_info "Skipping AI inference diagnostics during startup."
fi
