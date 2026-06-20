#!/usr/bin/env bash
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
VAULT_TOKEN="${VAULT_TOKEN:-root}"
POLICY_FILE="${POLICY_FILE:-security/vault/policies.hcl}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

vault_curl() {
  curl -fsS \
    -H "X-Vault-Token: $VAULT_TOKEN" \
    -H "content-type: application/json" \
    "$@"
}

wait_for_vault() {
  local attempt
  for attempt in $(seq 1 60); do
    if curl -fsS "$VAULT_ADDR/v1/sys/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "Vault is not ready at $VAULT_ADDR" >&2
  exit 1
}

require_command curl
require_command jq

if [[ ! -f "$POLICY_FILE" ]]; then
  echo "missing Vault policy file: $POLICY_FILE" >&2
  exit 1
fi

wait_for_vault

mounts="$(vault_curl "$VAULT_ADDR/v1/sys/mounts")"
secret_type="$(jq -r '."secret/".type // empty' <<<"$mounts")"
secret_version="$(jq -r '."secret/".options.version // empty' <<<"$mounts")"

if [[ -z "$secret_type" ]]; then
  vault_curl -X POST \
    -d '{"type":"kv","options":{"version":"2"}}' \
    "$VAULT_ADDR/v1/sys/mounts/secret" >/dev/null
elif [[ "$secret_type" != "kv" || "$secret_version" != "2" ]]; then
  echo "Vault secret/ mount must be kv-v2, found type=$secret_type version=${secret_version:-1}" >&2
  exit 1
fi

policy_json="$(jq -Rs '{policy: .}' "$POLICY_FILE")"
vault_curl -X PUT \
  -d "$policy_json" \
  "$VAULT_ADDR/v1/sys/policies/acl/healthcare-exchange" >/dev/null

vault_curl -X POST \
  -d '{"data":{"JWT_SECRET":"local-dev-change-me-with-32-characters","DATABASE_URL":"postgres://hde:hde_password@postgres:5432/hde","REDIS_URL":"redis://redis:6379","MINIO_ENDPOINT":"http://minio:9000","MINIO_ACCESS_KEY":"minioadmin","MINIO_SECRET_KEY":"minioadmin","MINIO_BUCKET":"healthcare-documents"}}' \
  "$VAULT_ADDR/v1/secret/data/hde/exchange-api" >/dev/null

secret="$(vault_curl "$VAULT_ADDR/v1/secret/data/hde/exchange-api")"
jwt_secret="$(jq -r '.data.data.JWT_SECRET // empty' <<<"$secret")"
database_url="$(jq -r '.data.data.DATABASE_URL // empty' <<<"$secret")"
minio_bucket="$(jq -r '.data.data.MINIO_BUCKET // empty' <<<"$secret")"

if [[ "$jwt_secret" != "local-dev-change-me-with-32-characters" ]]; then
  echo "Vault secret readback did not include the expected jwt_secret" >&2
  exit 1
fi

if [[ "$database_url" != "postgres://hde:hde_password@postgres:5432/hde" ]]; then
  echo "Vault secret readback did not include the expected database_url" >&2
  exit 1
fi

if [[ "$minio_bucket" != "healthcare-documents" ]]; then
  echo "Vault secret readback did not include the expected minio_bucket" >&2
  exit 1
fi

vault_curl "$VAULT_ADDR/v1/sys/policies/acl/healthcare-exchange" \
  | jq -e '.data.policy | contains("secret/data/hde/*")' >/dev/null

echo "Vault validation passed: kv-v2, policy, and secret readback verified"
