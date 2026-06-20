#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
PORTAL_URL="${PORTAL_URL:-http://localhost:5173}"

curl -fsS "$BASE_URL/health/live" >/dev/null
curl -fsS "$BASE_URL/health/ready" >/dev/null
curl -fsS "$PORTAL_URL/" | grep -qi "<!doctype html"

if curl -fsS "$BASE_URL/compliance/summary" >/dev/null 2>&1; then
  echo "compliance summary unexpectedly allowed an anonymous request" >&2
  exit 1
fi

if curl -fsS "$BASE_URL/compliance/summary" \
  -H "authorization: Bearer invalid-token" >/dev/null 2>&1; then
  echo "compliance summary unexpectedly allowed an invalid bearer token" >&2
  exit 1
fi

token="$(curl -sS -X POST "$BASE_URL/auth/token" \
  -H 'content-type: application/json' \
  -d '{"apiKey":"agency-local-api-key"}' | jq -r '.accessToken')"

if [[ -z "$token" || "$token" == "null" ]]; then
  echo "failed to obtain agency bearer token" >&2
  exit 1
fi

curl -fsS "$BASE_URL/compliance/summary" \
  -H "authorization: Bearer $token" >/dev/null

echo "smoke test passed"
