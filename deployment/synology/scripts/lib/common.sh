#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(cd "${SELF_DIR}/.." && pwd)"
SYN_ROOT="$(cd "${SCRIPTS_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SYN_ROOT}/../.." && pwd)"
ENV_DIR="${SYN_ROOT}/env"
DOCKER_DIR="${SYN_ROOT}/docker"
DEFAULT_INSTALL_ROOT="/volume1/joinerflow"

log_info() { printf '[INFO] %s\n' "$*"; }
log_warn() { printf '[WARN] %s\n' "$*" >&2; }
log_error() { printf '[ERROR] %s\n' "$*" >&2; }

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    log_error "Required command not found: ${cmd}"
    return 1
  fi
}

load_env_files() {
  local files=(
    "${ENV_DIR}/.env.synology"
    "${ENV_DIR}/.env.production"
    "${ENV_DIR}/.env.ai"
  )

  set -a
  for file in "${files[@]}"; do
    if [ -f "$file" ]; then
      # shellcheck disable=SC1090
      . "$file"
    fi
  done
  set +a

  export JOINERFLOW_INSTALL_ROOT="${JOINERFLOW_INSTALL_ROOT:-$DEFAULT_INSTALL_ROOT}"
  export JOINERFLOW_PROJECT_NAME="${JOINERFLOW_PROJECT_NAME:-joinerflow}"
  export AI_ENABLED="${AI_ENABLED:-true}"
  export JOINERFLOW_ENABLE_QDRANT="${JOINERFLOW_ENABLE_QDRANT:-true}"
  export JOINERFLOW_ENABLE_OPEN_WEBUI="${JOINERFLOW_ENABLE_OPEN_WEBUI:-false}"
}

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
    return 0
  fi

  log_error "Docker Compose is required but not installed."
  return 1
}

compose_prod() {
  compose_cmd \
    --project-name "${JOINERFLOW_PROJECT_NAME:-joinerflow}" \
    --env-file "${ENV_DIR}/.env.synology" \
    --env-file "${ENV_DIR}/.env.production" \
    --env-file "${ENV_DIR}/.env.ai" \
    -f "${DOCKER_DIR}/docker-compose.prod.yml" \
    "$@"
}

compose_ai() {
  compose_cmd \
    --project-name "${JOINERFLOW_PROJECT_NAME:-joinerflow-ai}" \
    --env-file "${ENV_DIR}/.env.synology" \
    --env-file "${ENV_DIR}/.env.production" \
    --env-file "${ENV_DIR}/.env.ai" \
    -f "${DOCKER_DIR}/docker-compose.ai.yml" \
    "$@"
}

ensure_absolute_path() {
  local value="$1"
  local label="$2"
  if [ -z "$value" ] || [ "${value#/}" = "$value" ]; then
    log_error "${label} must be an absolute path. Current value: ${value:-<empty>}"
    return 1
  fi
}

generate_secret() {
  local length="${1:-48}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 128 | tr -d '\n' | cut -c1-"$length"
    return 0
  fi
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$length"
}

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

validate_absolute_csv_paths() {
  local key="$1"
  local value="${!key:-}"
  local entry
  local failed=0
  IFS=',' read -r -a _entries <<< "$value"
  for entry in "${_entries[@]}"; do
    entry="$(printf '%s' "$entry" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [ -z "$entry" ] && continue
    if [ "${entry#/}" = "$entry" ]; then
      log_error "${key} contains a non-absolute path: ${entry}"
      failed=1
    fi
  done
  [ "$failed" -eq 0 ]
}
