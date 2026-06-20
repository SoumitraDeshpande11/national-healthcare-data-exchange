#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "$SCRIPT_DIR/validate-minio.mjs"
bash "$SCRIPT_DIR/validate-vault.sh"
bash "$SCRIPT_DIR/validate-observability.sh"

echo "Local integration validation passed"
