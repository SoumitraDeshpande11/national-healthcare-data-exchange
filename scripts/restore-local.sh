#!/usr/bin/env bash
set -euo pipefail

backup_dir="${1:-}"
if [[ -z "$backup_dir" || ! -f "$backup_dir/postgres.sql" ]]; then
  echo "usage: scripts/restore-local.sh backups/YYYYMMDD-HHMMSS"
  exit 1
fi

docker compose exec -T postgres psql -U hde -d hde -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
docker compose exec -T postgres psql -U hde -d hde < "$backup_dir/postgres.sql"

echo "database restored from $backup_dir"
