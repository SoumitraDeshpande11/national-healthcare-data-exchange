#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
PORTAL_URL="${PORTAL_URL:-http://localhost:5173}"

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts="${3:-40}"

  for attempt in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/tmp/hde-smoke-response.txt 2>/tmp/hde-smoke-error.txt; then
      cat /tmp/hde-smoke-response.txt
      return 0
    fi

    if [[ "$attempt" -eq "$attempts" ]]; then
      echo "$label did not become ready after $attempts attempts" >&2
      cat /tmp/hde-smoke-error.txt >&2 || true
      return 1
    fi

    sleep 2
  done
}

wait_for_url "$BASE_URL/health/live" "API liveness" >/dev/null
wait_for_url "$BASE_URL/health/ready" "API readiness" >/dev/null
wait_for_url "$PORTAL_URL/" "Portal" | grep -qi "<!doctype html"

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
