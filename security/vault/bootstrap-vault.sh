#!/usr/bin/env bash
set -euo pipefail

export VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
export VAULT_TOKEN="${VAULT_TOKEN:-root}"

vault secrets enable -path=secret kv-v2 >/dev/null 2>&1 || true
vault policy write healthcare-exchange security/vault/policies.hcl
vault kv put secret/hde/exchange-api \
  DATABASE_URL="postgres://hde:hde_password@postgres:5432/hde" \
  REDIS_URL="redis://redis:6379" \
  JWT_SECRET="local-dev-change-me-with-32-characters" \
  MINIO_ENDPOINT="http://minio:9000" \
  MINIO_ACCESS_KEY="minioadmin" \
  MINIO_SECRET_KEY="minioadmin" \
  MINIO_BUCKET="healthcare-documents" \
  ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173" \
  AUDIT_LOG_PATH="/var/log/hde/audit.log"
