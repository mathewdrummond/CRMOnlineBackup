#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="${SCRIPT_DIR}/scripts"

# shellcheck source=scripts/lib/common.sh
. "${SCRIPTS_DIR}/lib/common.sh"

timestamp="$(date +%Y%m%d-%H%M%S)"
bundle_name="joinerflow-synology-${timestamp}"
release_dir="${REPO_ROOT}/release"
stage_dir="${release_dir}/${bundle_name}"
zip_path="${release_dir}/${bundle_name}.zip"

mkdir -p "${release_dir}"
rm -rf "${stage_dir}" "${zip_path}"

log_info "Staging Synology release bundle at ${stage_dir}."
rsync -a \
  --exclude '.git/' \
  --exclude '.joinerflow-runtime/' \
  --exclude 'node_modules/' \
  --exclude 'coverage/' \
  --exclude 'test-results/' \
  --exclude 'filesystem/' \
  --exclude 'release/' \
  --exclude '.DS_Store' \
  "${REPO_ROOT}/" "${stage_dir}/"

log_info "Ensuring Synology shell scripts are executable in staged bundle."
find "${stage_dir}/deployment/synology" -type f -name '*.sh' -exec chmod +x {} +

log_info "Creating zip archive ${zip_path}."
(
  cd "${release_dir}"
  zip -rq "${bundle_name}.zip" "${bundle_name}"
)

rm -rf "${stage_dir}"
log_info "Bundle created: ${zip_path}"
