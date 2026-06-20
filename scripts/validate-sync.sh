#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
national_health_id="NHID-SYNC-$(date +%s)-$RANDOM"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

require_command curl
require_command jq
require_command docker

token="$(curl -fsS -X POST "$BASE_URL/auth/token" \
  -H 'content-type: application/json' \
  -d '{"apiKey":"hospital-local-api-key"}' | jq -r '.accessToken')"

if [[ -z "$token" || "$token" == "null" ]]; then
  echo "failed to obtain hospital bearer token" >&2
  exit 1
fi

curl -fsS -X POST "$BASE_URL/patients" \
  -H "authorization: Bearer $token" \
  -H 'content-type: application/json' \
  -d "{\"nationalHealthId\":\"$national_health_id\",\"fullName\":\"Sync Validation Patient\",\"dateOfBirth\":\"1990-01-01\",\"consentStatus\":\"active\"}" >/dev/null

record_id="$(curl -fsS -X POST "$BASE_URL/records" \
  -H "authorization: Bearer $token" \
  -H 'content-type: application/json' \
  -d "{\"nationalHealthId\":\"$national_health_id\",\"recordType\":\"encounter\",\"payload\":{\"validation\":\"redis-sync-worker\"}}" \
  | jq -r '.id')"

if [[ -z "$record_id" || "$record_id" == "null" ]]; then
  echo "failed to create validation record" >&2
  exit 1
fi

for _attempt in $(seq 1 30); do
  status="$(docker compose exec -T postgres psql -U hde -d hde -tAc \
    "select status from sync_events where record_id = '$record_id' order by created_at desc limit 1")"

  if [[ "$status" == "published" ]]; then
    echo "Sync validation passed: record $record_id reached published status"
    exit 0
  fi

  sleep 1
done

echo "sync event for record $record_id did not reach published status; last status=${status:-missing}" >&2
exit 1
