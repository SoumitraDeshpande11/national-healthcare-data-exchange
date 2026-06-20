#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"

token="$(curl -sS -X POST "$BASE_URL/auth/token" \
  -H 'content-type: application/json' \
  -d '{"apiKey":"hospital-local-api-key"}' | jq -r '.accessToken')"

if [[ -z "$token" || "$token" == "null" ]]; then
  echo "failed to obtain hospital bearer token" >&2
  exit 1
fi

curl -sS -X POST "$BASE_URL/patients" \
  -H "authorization: Bearer $token" \
  -H 'content-type: application/json' \
  -d '{"nationalHealthId":"NHID-1000001","fullName":"Aarav Mehta","dateOfBirth":"1997-04-12","consentStatus":"active"}' | jq .

organization_ids="$(curl -sS "$BASE_URL/auth/organizations" \
  -H "authorization: Bearer $token" | jq -r '.organizations[] | select(.type != "agency") | .id')"

while IFS= read -r organization_id; do
  [[ -z "$organization_id" ]] && continue
  curl -sS -X POST "$BASE_URL/patients/NHID-1000001/access-grants" \
    -H "authorization: Bearer $token" \
    -H 'content-type: application/json' \
    -d "{\"organizationId\":\"$organization_id\"}" >/dev/null
done <<< "$organization_ids"

curl -sS -X POST "$BASE_URL/records" \
  -H "authorization: Bearer $token" \
  -H 'content-type: application/json' \
  -d '{"nationalHealthId":"NHID-1000001","recordType":"encounter","payload":{"diagnosis":"viral fever","facility":"Metro General Hospital","temperatureC":38.2}}' | jq .

echo "demo patient seeded and access granted to participant organizations"
