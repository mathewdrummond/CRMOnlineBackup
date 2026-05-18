#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files
require_cmd rsync
require_cmd npm

cd "${REPO_ROOT}"

log_info "Installing dependencies."
npm install --include=dev

log_info "Building release artifacts."
npm run build:release

log_info "Syncing build artifacts to ${JOINERFLOW_INSTALL_ROOT}/app."
mkdir -p "${JOINERFLOW_INSTALL_ROOT}/app"
rsync -a --delete "${REPO_ROOT}/client/dist/" "${JOINERFLOW_INSTALL_ROOT}/app/client-dist/"
rsync -a --delete "${REPO_ROOT}/clock-client/dist/" "${JOINERFLOW_INSTALL_ROOT}/app/clock-client-dist/"
rsync -a --delete "${REPO_ROOT}/server/dist/" "${JOINERFLOW_INSTALL_ROOT}/app/server-dist/"

log_info "Build artifact sync completed."
