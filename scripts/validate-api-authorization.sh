#!/usr/bin/env bash
set -euo pipefail

npm --workspace services/exchange-api exec -- vitest run scripts/api-authorization-check.test.ts --root ../..
