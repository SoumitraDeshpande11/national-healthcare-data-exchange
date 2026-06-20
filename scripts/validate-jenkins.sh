#!/usr/bin/env bash
set -euo pipefail

JENKINS_URL="${JENKINS_URL:-http://localhost:8081}"
JENKINS_USER="${JENKINS_USER:-soumitra}"
JENKINS_PASSWORD="${JENKINS_PASSWORD:-deshpande}"
JENKINS_JOB="${JENKINS_JOB:-national-healthcare-data-exchange}"
RUN_JENKINS_BUILD="${RUN_JENKINS_BUILD:-false}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

jenkins_get() {
  curl -fsS -u "$JENKINS_USER:$JENKINS_PASSWORD" "$@"
}

wait_for_jenkins() {
  local attempt

  for attempt in $(seq 1 90); do
    if jenkins_get "$JENKINS_URL/api/json" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "Jenkins is not ready at $JENKINS_URL" >&2
  exit 1
}

trigger_safe_build() {
  local cookie_jar crumb_json crumb_field crumb_value build_number build_data building result attempt

  cookie_jar="$(mktemp)"
  crumb_json="$(curl -fsS -c "$cookie_jar" -u "$JENKINS_USER:$JENKINS_PASSWORD" "$JENKINS_URL/crumbIssuer/api/json")"
  crumb_field="$(jq -r '.crumbRequestField' <<<"$crumb_json")"
  crumb_value="$(jq -r '.crumb' <<<"$crumb_json")"

  curl -fsS \
    -b "$cookie_jar" \
    -u "$JENKINS_USER:$JENKINS_PASSWORD" \
    -X POST \
    -H "$crumb_field: $crumb_value" \
    --data-urlencode BUILD_CONTAINER=false \
    --data-urlencode VERIFY_RUNNING_PLATFORM=false \
    --data-urlencode RUN_LIVE_SMOKE=false \
    --data-urlencode RUN_TRIVY=false \
    --data-urlencode DEPLOY_LOCAL_K8S=false \
    --data-urlencode RUN_TERRAFORM=false \
    "$JENKINS_URL/job/$JENKINS_JOB/buildWithParameters" >/dev/null

  rm -f "$cookie_jar"

  for attempt in $(seq 1 30); do
    build_number="$(jenkins_get "$JENKINS_URL/job/$JENKINS_JOB/api/json" | jq -r '.lastBuild.number // empty')"
    if [[ -n "$build_number" ]]; then
      break
    fi
    sleep 2
  done

  if [[ -z "${build_number:-}" ]]; then
    echo "Jenkins did not create a build for $JENKINS_JOB" >&2
    exit 1
  fi

  for attempt in $(seq 1 90); do
    build_data="$(jenkins_get "$JENKINS_URL/job/$JENKINS_JOB/$build_number/api/json")"
    building="$(jq -r '.building' <<<"$build_data")"
    result="$(jq -r '.result // "RUNNING"' <<<"$build_data")"

    if [[ "$building" == "false" ]]; then
      if [[ "$result" == "SUCCESS" ]]; then
        echo "Jenkins validation build #$build_number passed"
        return 0
      fi

      echo "Jenkins validation build #$build_number finished with $result" >&2
      exit 1
    fi

    sleep 5
  done

  echo "Jenkins validation build #$build_number did not finish in time" >&2
  exit 1
}

require_command curl
require_command jq

wait_for_jenkins

job="$(jenkins_get "$JENKINS_URL/job/$JENKINS_JOB/api/json")"
if [[ "$(jq -r '.buildable' <<<"$job")" != "true" ]]; then
  echo "Jenkins job $JENKINS_JOB is not buildable" >&2
  exit 1
fi

parameters="$(jenkins_get --globoff "$JENKINS_URL/job/$JENKINS_JOB/api/json?tree=property[parameterDefinitions[name]]")"
for parameter in BUILD_CONTAINER VERIFY_RUNNING_PLATFORM RUN_LIVE_SMOKE RUN_TRIVY DEPLOY_LOCAL_K8S RUN_TERRAFORM; do
  if ! jq -e --arg parameter "$parameter" \
    'any(.property[].parameterDefinitions[]?; .name == $parameter)' <<<"$parameters" >/dev/null; then
    echo "Jenkins job $JENKINS_JOB is missing parameter $parameter" >&2
    exit 1
  fi
done

if command -v docker >/dev/null 2>&1 && docker compose ps -q jenkins >/dev/null 2>&1; then
  docker compose exec -T jenkins sh -lc \
    'node --version >/dev/null && npm --version >/dev/null && docker --version >/dev/null && docker compose version >/dev/null && kubectl version --client=true >/dev/null && terraform version >/dev/null'
fi

if [[ "$RUN_JENKINS_BUILD" == "true" ]]; then
  trigger_safe_build
fi

echo "Jenkins validation passed"
