#!/usr/bin/env bash
set -euo pipefail

echo "starting local failover drill"
docker compose stop exchange-api
sleep 5
docker compose up -d exchange-api
sleep 10
bash scripts/smoke-test.sh
echo "failover drill completed"
