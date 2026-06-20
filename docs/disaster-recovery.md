# Disaster Recovery Runbook

The local project simulates disaster recovery procedures with Docker Compose services and shell scripts. The runbook demonstrates mechanics only; it does not provide production-grade backup durability, cross-region recovery, or audited RPO/RTO evidence.

## Scope

- PostgreSQL is the source of truth and is backed up with `pg_dump`.
- MinIO mirror backup is attempted on a best-effort basis.
- API failover is simulated by stopping and restarting the `exchange-api` container.
- RPO for the demo is the latest successful manual backup.
- RTO target for the demo exercise is under 30 minutes on the reviewer's local machine.
- Backup files are local plaintext artifacts under `backups/`.

## Create A Backup

Start the stack first:

```bash
docker compose up -d --build
bash scripts/smoke-test.sh
```

Create a backup:

```bash
npm run dr:backup
```

The script creates:

```text
backups/YYYYMMDD-HHMMSS/postgres.sql
```

It also tries to mirror `minio/healthcare-documents` into the same backup directory. That mirror is best effort because the current API does not create or require the bucket.

## Restore A Backup

Use a real timestamped directory from `backups/`:

```bash
npm run dr:restore -- backups/YYYYMMDD-HHMMSS
```

The restore script drops and recreates the PostgreSQL `public` schema, then imports `postgres.sql`.

Verify after restore:

```bash
bash scripts/smoke-test.sh

export AGENCY_TOKEN="$(
  curl -sS -X POST http://localhost:8080/auth/token \
    -H 'content-type: application/json' \
    -d '{"apiKey":"agency-local-api-key"}' | jq -r '.accessToken'
)"

curl -sS http://localhost:8080/compliance/summary \
  -H "authorization: Bearer $AGENCY_TOKEN" | jq .
```

## Run The Failover Drill

```bash
bash scripts/failover-drill.sh
```

The drill:

1. Stops the `exchange-api` container.
2. Waits 5 seconds.
3. Starts `exchange-api` again.
4. Waits 10 seconds.
5. Runs `scripts/smoke-test.sh`.

Expected final output:

```text
smoke test passed
failover drill completed
```

## Operational Notes

- `docker compose down -v` removes named volumes and deletes local database state. Take a backup first if the demo data matters.
- `restore-local.sh` is destructive to the current PostgreSQL `public` schema.
- The backup script assumes the default Compose project network name. If the directory name changes, Docker Compose may create a different network; in that case the PostgreSQL dump still works, but the MinIO mirror attempt may be skipped by its best-effort fallback.
- Delete local backup directories before submission unless the reviewer explicitly asks for generated DR artifacts.
