#!/usr/bin/env bash
set -euo pipefail

# Jenkins runs inside the Compose network, so it must reach sibling services by
# their Compose service names instead of host localhost ports.
export BASE_URL="${BASE_URL:-http://exchange-api:8080}"
export PORTAL_URL="${PORTAL_URL:-http://portal}"
export MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}"
export VAULT_ADDR="${VAULT_ADDR:-http://vault:8200}"
export PROMETHEUS_URL="${PROMETHEUS_URL:-http://prometheus:9090}"
export GRAFANA_URL="${GRAFANA_URL:-http://grafana:3000}"
export KIBANA_URL="${KIBANA_URL:-http://kibana:5601}"
export ELASTICSEARCH_URL="${ELASTICSEARCH_URL:-http://elasticsearch:9200}"
export JENKINS_URL="${JENKINS_URL:-http://localhost:8080}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-devops-exam}"

bash scripts/smoke-test.sh
node scripts/validate-minio.mjs
bash scripts/validate-vault.sh
bash scripts/validate-sync.sh
bash scripts/validate-observability.sh
bash scripts/validate-jenkins.sh

echo "Jenkins platform verification passed"
