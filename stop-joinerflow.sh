#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found in PATH."
  echo "Install Node.js 20.19+ or 22.12+ and rerun this script."
  exit 1
fi

echo "Stopping JoinerFlow local services..."
echo "Logs are retained in .joinerflow-runtime/logs"

exec npm run stop:local
