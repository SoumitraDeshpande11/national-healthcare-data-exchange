#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3000}"
GRAFANA_USER="${GRAFANA_USER:-soumitra}"
GRAFANA_PASSWORD="${GRAFANA_PASSWORD:-deshpande}"
KIBANA_URL="${KIBANA_URL:-http://localhost:5601}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local attempt

  for attempt in $(seq 1 90); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "$name is not ready at $url" >&2
  exit 1
}

wait_for_json_check() {
  local name="$1"
  local url="$2"
  local jq_filter="$3"
  local auth_mode="${4:-}"
  local attempt
  local response

  for attempt in $(seq 1 90); do
    if [[ "$auth_mode" == "grafana" ]]; then
      if response="$(curl -fsS -u "$GRAFANA_USER:$GRAFANA_PASSWORD" "$url" 2>/dev/null)" \
        && jq -e "$jq_filter" <<<"$response" >/dev/null; then
        return 0
      fi
    else
      if response="$(curl -fsS "$url" 2>/dev/null)" \
        && jq -e "$jq_filter" <<<"$response" >/dev/null; then
        return 0
      fi
    fi
    sleep 2
  done

  echo "$name did not reach the expected state at $url" >&2
  exit 1
}

require_command curl
require_command jq

wait_for_http "Exchange API" "$BASE_URL/health/live"
curl -fsS "$BASE_URL/health/live" >/dev/null
metrics="$(curl -fsS "$BASE_URL/metrics")"
if ! grep -q "hde_http_request_duration_seconds" <<<"$metrics"; then
  echo "Exchange API metrics endpoint did not expose hde_http_request_duration_seconds" >&2
  exit 1
fi
echo "API metrics validation passed"

wait_for_http "Prometheus" "$PROMETHEUS_URL/-/ready"
wait_for_json_check \
  "Prometheus exchange-api target" \
  "$PROMETHEUS_URL/api/v1/targets?state=active" \
  '.status == "success" and any(.data.activeTargets[]?; .labels.job == "exchange-api" and .health == "up")'

prometheus_query="$PROMETHEUS_URL/api/v1/query?query=up%7Bjob%3D%22exchange-api%22%7D"
wait_for_json_check \
  "Prometheus exchange-api scrape query" \
  "$prometheus_query" \
  '.status == "success" and any(.data.result[]?; .value[1] == "1")'
echo "Prometheus validation passed"

wait_for_json_check \
  "Grafana health" \
  "$GRAFANA_URL/api/health" \
  '.database == "ok"' \
  grafana

datasource="$(curl -fsS -u "$GRAFANA_USER:$GRAFANA_PASSWORD" "$GRAFANA_URL/api/datasources/name/Prometheus")"
datasource_uid="$(jq -r '.uid // empty' <<<"$datasource")"
datasource_url="$(jq -r '.url // empty' <<<"$datasource")"
if [[ -z "$datasource_uid" || "$datasource_url" != "http://prometheus:9090" ]]; then
  echo "Grafana Prometheus datasource is missing or points at $datasource_url" >&2
  exit 1
fi

grafana_proxy_query="$GRAFANA_URL/api/datasources/proxy/uid/$datasource_uid/api/v1/query?query=up%7Bjob%3D%22exchange-api%22%7D"
wait_for_json_check \
  "Grafana datasource proxy" \
  "$grafana_proxy_query" \
  '.status == "success" and any(.data.result[]?; .value[1] == "1")' \
  grafana

wait_for_json_check \
  "Grafana dashboard provisioning" \
  "$GRAFANA_URL/api/search?query=Healthcare%20Exchange%20API" \
  'any(.[]?; .title == "Healthcare Exchange API")' \
  grafana
echo "Grafana validation passed"

wait_for_json_check \
  "Kibana status" \
  "$KIBANA_URL/api/status" \
  '.status.overall.level == "available" and ((.status.core.elasticsearch.level? // .status.plugins.elasticsearch.level? // "available") == "available")'
echo "Kibana validation passed"

echo "Observability validation passed"
