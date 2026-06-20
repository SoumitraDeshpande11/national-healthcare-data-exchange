#!/usr/bin/env bash
set -euo pipefail

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="backups/$timestamp"
mkdir -p "$backup_dir"

docker compose exec -T postgres pg_dump -U hde -d hde > "$backup_dir/postgres.sql"
docker run --rm --network devops-exam_default \
  -e MC_HOST_minio=http://soumitra:deshpande@minio:9000 \
  -v "$(pwd)/$backup_dir:/backup" minio/mc:RELEASE.2024-06-12T14-34-03Z \
  mirror minio/healthcare-documents /backup/minio >/dev/null 2>&1 || true

echo "backup created at $backup_dir"
