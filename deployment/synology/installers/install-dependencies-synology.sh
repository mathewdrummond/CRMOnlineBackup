#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../scripts/lib/common.sh
. "${SCRIPT_DIR}/../scripts/lib/common.sh"

log_info "Dependency installer started."

if command -v synopkg >/dev/null 2>&1; then
  if synopkg status ContainerManager >/dev/null 2>&1 || synopkg status Docker >/dev/null 2>&1; then
    log_info "Container Manager or Docker package already present."
  else
    log_warn "Container Manager package not installed."
    log_warn "Install from DSM Package Center: Container Manager (DSM 7.2+) before continuing."
  fi
fi

missing=0
for cmd in docker curl jq awk sed grep find rsync tar gzip; do
  if command -v "$cmd" >/dev/null 2>&1; then
    log_info "Dependency present: ${cmd}"
  else
    log_error "Dependency missing: ${cmd}"
    missing=$((missing + 1))
  fi
done

if docker compose version >/dev/null 2>&1; then
  log_info "Dependency present: docker compose plugin"
elif command -v docker-compose >/dev/null 2>&1; then
  log_info "Dependency present: docker-compose"
else
  log_error "Dependency missing: docker compose plugin"
  missing=$((missing + 1))
fi

if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  node_version="$(node -v | sed 's/^v//')"
  node_major="$(printf '%s' "$node_version" | cut -d. -f1)"
  node_minor="$(printf '%s' "$node_version" | cut -d. -f2)"
  if [ "$node_major" -gt 20 ] || { [ "$node_major" -eq 20 ] && [ "$node_minor" -ge 19 ]; }; then
    log_info "Node runtime supported: v${node_version}"
  else
    log_error "Node runtime unsupported: v${node_version} (require 20.19+ or 22.12+)"
    missing=$((missing + 1))
  fi
else
  log_error "Node.js and npm are required on host for build/release scripts."
  missing=$((missing + 1))
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  log_warn "sqlite3 not found; backup integrity checks will be limited."
fi

if [ "$missing" -gt 0 ]; then
  log_error "${missing} required dependency binaries are missing."
  exit 1
fi

if ! docker version >/dev/null 2>&1; then
  log_error "Docker daemon is not available. Start Container Manager."
  exit 1
fi

log_info "Dependency validation complete."
