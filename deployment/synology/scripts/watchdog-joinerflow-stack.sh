#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/syno/bin:/usr/syno/sbin:${PATH:-}"

load_env_files
require_cmd docker
require_cmd curl

log_file="${LOG_DIRECTORY:-${JOINERFLOW_INSTALL_ROOT}/logs}/watchdog.log"
lock_dir="/tmp/joinerflow-watchdog.lock"

mkdir -p "$(dirname "$log_file")"

if ! mkdir "$lock_dir" 2>/dev/null; then
  log_info "JoinerFlow watchdog already running; exiting."
  exit 0
fi
trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT

log_watchdog() {
  printf '[%s] %s\n' "$(date -Iseconds)" "$*" | tee -a "$log_file"
}

service_args=(postgres joinerflow-server joinerflow-client joinerflow-clock-client caddy)
container_names=(joinerflow-postgres joinerflow-server joinerflow-client joinerflow-clock-client joinerflow-proxy)

if is_true "${AI_ENABLED:-true}"; then
  if uses_local_qdrant; then
    service_args+=(qdrant)
    container_names+=(joinerflow-qdrant)
  fi
  if uses_local_ollama; then
    service_args+=(ollama)
    container_names+=(ollama)
  fi
fi

stack_needs_start=false
for container in "${container_names[@]}"; do
  if ! docker inspect "$container" >/dev/null 2>&1; then
    log_watchdog "Container missing: ${container}"
    stack_needs_start=true
    continue
  fi

  running="$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || printf 'false')"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || printf 'unknown')"
  if [ "$running" != "true" ] || [ "$health" = "unhealthy" ]; then
    log_watchdog "Container requires recovery: ${container} running=${running} health=${health}"
    stack_needs_start=true
  fi
done

if [ "$stack_needs_start" = true ]; then
  log_watchdog "Starting/recovering JoinerFlow stack."
  compose_prod up -d --remove-orphans "${service_args[@]}" >>"$log_file" 2>&1
else
  log_watchdog "JoinerFlow containers are present and not unhealthy."
fi

server_url="http://127.0.0.1:${JOINERFLOW_SERVER_PORT:-4000}/health"
server_healthy=false
for _ in {1..30}; do
  if curl -fsS "$server_url" >/dev/null 2>&1; then
    server_healthy=true
    break
  fi
  sleep 2
done

if [ "$server_healthy" != true ]; then
  log_watchdog "Server health endpoint failed; restarting API and proxy."
  compose_prod restart joinerflow-server caddy >>"$log_file" 2>&1 || true
  sleep 10
fi

if curl -fsS "$server_url" >/dev/null 2>&1; then
  log_watchdog "JoinerFlow watchdog check passed."
else
  log_watchdog "JoinerFlow watchdog check failed after recovery attempt."
  exit 1
fi
