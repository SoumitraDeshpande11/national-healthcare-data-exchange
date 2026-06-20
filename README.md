# National Healthcare Data Exchange

This repository is a runnable local demonstration of a healthcare data exchange platform. It models how a national agency, hospitals, laboratories, pharmacies, and insurers can exchange patient records through authenticated APIs with RBAC, audit logs, sync events, monitoring, compliance checks, CI/CD, Kubernetes manifests, and disaster-recovery scripts.

It is built for DevOps and platform engineering practice. It is not certified, hardened, or suitable for real patient data.

## What Runs

The default runtime is Docker Compose:

- `exchange-api`: TypeScript/Express API on `http://localhost:8080`.
- `portal`: React/Nginx portal on `http://localhost:5173`; Nginx proxies `/api/*` to `exchange-api`.
- `postgres`: PostgreSQL system of record for organizations, patient grants, patients, clinical records, document metadata, sync events, and audit logs.
- `redis`: Pub/sub bus used by record creation to publish `patient-record-sync` events.
- `sync-worker`: Redis subscriber that marks queued patient-record sync events as published.
- `minio`: S3-compatible object store for uploaded patient documents; record payloads stay in PostgreSQL JSONB.
- `vault`: local dev Vault instance for secret-management policy examples.
- `prometheus`: scrapes API metrics from `/metrics` and Jenkins metrics from `/prometheus/`.
- `grafana`: local dashboard container with Prometheus-backed API and Jenkins panels.
- `jenkins`: local CI server with a pre-created healthcare exchange pipeline job and Prometheus metrics plugin.
- `elasticsearch`, `kibana`, and `filebeat`: local log/search stack for API and audit logs.

The API starts by running database migrations from `services/exchange-api/src/db/migrate.ts`. Those migrations create five demo organizations and the core tables.

## Demo Boundaries And Security Notes

- All services are intended for local review only. Compose ports bind to the host and use static demo credentials.
- Demo API keys are intentionally listed in this README. They are hashed in PostgreSQL for the auth flow, but they are not production secrets.
- JWTs expire after one hour and are signed with the configured `JWT_SECRET`; the default local value must be replaced for any non-demo environment.
- RBAC, patient access grants, and role/type permissions are enforced in the API routes, and patient record/document workflows check the current consent flag. This is application-level demo enforcement, not a complete clinical consent or privacy system.
- Audit events are written to PostgreSQL and also appended to the configured audit log path. Local files, database volumes, and backups are not encrypted by this project.
- Kubernetes manifests include RBAC, security contexts, Secrets, and NetworkPolicy examples, but they still contain local demo credentials and require cluster-specific hardening before real use.

## Tools In This Repo

| Tool or file | What it does |
| --- | --- |
| `services/exchange-api` | Express API for auth, patient registry, record exchange, compliance summaries, audit-event lookup, health checks, and Prometheus metrics. |
| `services/portal` | React portal with organization personas, login, patient registration, record publishing/search, compliance summary, and audit review. |
| `docker-compose.yml` | Full local stack for API, portal, PostgreSQL, Redis, MinIO, Vault, Prometheus, Grafana, Jenkins, Elasticsearch, and Kibana. |
| `scripts/smoke-test.sh` | Verifies `/health/live`, `/health/ready`, agency token issuance, and agency compliance access. |
| `scripts/seed-demo.sh` | Logs in as the hospital, upserts one demo patient, and publishes one encounter record. |
| `scripts/compliance-check.sh` | Checks required governance files, scans for obvious secret material, and confirms route handlers call `writeAudit`. |
| `scripts/validate-integrations.sh` | Verifies MinIO, Vault, Jenkins, Redis sync-worker, Prometheus, Grafana, Kibana, and Elasticsearch/Filebeat log ingestion are connected. |
| `scripts/backup-local.sh` | Dumps PostgreSQL to `backups/YYYYMMDD-HHMMSS/postgres.sql` and attempts a MinIO mirror. |
| `scripts/restore-local.sh` | Restores PostgreSQL from a selected local backup directory. |
| `scripts/failover-drill.sh` | Stops and restarts the API container, then runs the smoke test. |
| `Jenkinsfile` | Jenkins pipeline for install, typecheck, compliance check, tests, build, container build, audit/Trivy scan, and local Kubernetes deploy. |
| `.github/workflows/ci.yml` | GitHub Actions validation for install, lint/typecheck, tests, compliance check, and API image build. |
| `kubernetes/base` | Kustomize manifests for namespace, RBAC, secrets, config, PostgreSQL, Redis, MinIO, API deployment, network policy, and HPA. |
| `terraform/local` | Local Kubernetes governance namespace/config map and optional kube-prometheus-stack Helm release. |
| `security/vault` | Vault KV policy and bootstrap script for local secret examples. |

## Prerequisites

- Node.js 20 or newer.
- Docker Desktop or another Docker Compose compatible runtime.
- `jq` for the shell demo scripts.
- `ripgrep` (`rg`) for `scripts/compliance-check.sh`.
- Optional: `kubectl`, Kind or Docker Desktop Kubernetes, Terraform, Helm, Vault CLI.

## Quick Start

```bash
npm install
docker compose up -d --build
bash scripts/smoke-test.sh
bash scripts/seed-demo.sh
```

Open the portal:

```text
http://localhost:5173
```

Use any organization persona shown in the portal. The same demo API keys are listed below for direct API calls.

## Demo API Keys

| Organization | Type | API key |
| --- | --- | --- |
| National Health Agency | `agency` | `agency-local-api-key` |
| Metro General Hospital | `hospital` | `hospital-local-api-key` |
| Apex Diagnostic Lab | `laboratory` | `lab-local-api-key` |
| CarePlus Pharmacy | `pharmacy` | `pharmacy-local-api-key` |
| Unified Health Insurance | `insurer` | `insurer-local-api-key` |

API keys are stored as SHA-256 hashes in the seeded `organizations` table. `/auth/token` exchanges a valid key for a one-hour JWT. The portal displays the insurer persona as `SecureLife Insurance`, while the seeded API organization name is `Unified Health Insurance`.

## Service URLs

| Service | URL | Notes |
| --- | --- | --- |
| Portal | `http://localhost:5173` | Main demo UI. |
| API | `http://localhost:8080` | Health, auth, patients, records, documents, compliance, metrics. |
| Prometheus | `http://localhost:9090` | Scrapes `exchange-api:8080/metrics` and `jenkins:8080/prometheus/`. |
| Grafana | `http://localhost:3000` | `soumitra` / `deshpande`; dashboard `Healthcare Exchange API`. |
| Jenkins | `http://localhost:8081` | `soumitra` / `deshpande`; job `national-healthcare-data-exchange`; metrics at `/prometheus/`. |
| MinIO Console | `http://localhost:9001` | `soumitra` / `deshpande`. |
| Vault | `http://localhost:8200` | Root token `root` in dev mode. |
| Kibana | `http://localhost:5601` | Connected to local Elasticsearch. |

## Exact Test And Demo Steps

1. Install dependencies.

   ```bash
   npm install
   ```

2. Run static validation, unit tests, and builds.

   ```bash
   npm run lint
   npm test
   npm run build
   npm run build:portal
   bash scripts/compliance-check.sh
   ```

   Unit and compliance tests cover API liveness, patient access grants, role/type authorization, revoked consent, canonical document workflows, and compliance endpoint access. `npm run lint` is a TypeScript no-emit check for the API.

3. Start the full stack.

   ```bash
   docker compose up -d --build
   ```

4. Verify the stack.

   ```bash
   bash scripts/smoke-test.sh
   curl -sS http://localhost:8080/health/live | jq .
   curl -sS http://localhost:8080/health/ready | jq .
   curl -sS http://localhost:8080/metrics | head
   npm run validate:integrations
   ```

   `npm run validate:integrations` proves that MinIO object storage, Vault secrets, Jenkins, Redis sync-worker publication, Prometheus, Grafana, Kibana, and Elasticsearch/Filebeat log ingestion are all connected. Jenkins is available at `http://localhost:8081` with `soumitra` / `deshpande`. Open the `national-healthcare-data-exchange` job and run `Build with Parameters`. The default build installs dependencies, validates the app, builds it, renders Kubernetes manifests, and builds local Docker images. `RUN_LIVE_SMOKE` is off by default because it uses the same Compose ports as the running local stack.

5. Seed demo data.

   ```bash
   bash scripts/seed-demo.sh
   ```

   This creates or updates patient `NHID-1000001`, grants that patient to participant organizations, and publishes an `encounter` record as Metro General Hospital.

6. Exercise the API directly.

   ```bash
   export HOSPITAL_TOKEN="$(
     curl -sS -X POST http://localhost:8080/auth/token \
       -H 'content-type: application/json' \
       -d '{"apiKey":"hospital-local-api-key"}' | jq -r '.accessToken'
   )"

   curl -sS http://localhost:8080/patients/NHID-1000001 \
     -H "authorization: Bearer $HOSPITAL_TOKEN" | jq .

   curl -sS http://localhost:8080/records/patient/NHID-1000001 \
     -H "authorization: Bearer $HOSPITAL_TOKEN" | jq .
   ```

7. Review agency compliance data.

   ```bash
   export AGENCY_TOKEN="$(
     curl -sS -X POST http://localhost:8080/auth/token \
       -H 'content-type: application/json' \
       -d '{"apiKey":"agency-local-api-key"}' | jq -r '.accessToken'
   )"

   curl -sS http://localhost:8080/compliance/summary \
     -H "authorization: Bearer $AGENCY_TOKEN" | jq .

   curl -sS http://localhost:8080/compliance/audit-events \
     -H "authorization: Bearer $AGENCY_TOKEN" | jq '.auditEvents[0:5]'
   ```

8. Run recovery workflows.

   ```bash
   npm run dr:backup
   npm run dr:restore -- backups/YYYYMMDD-HHMMSS
   bash scripts/failover-drill.sh
   ```

9. Stop the stack.

   ```bash
   docker compose down
   ```

10. Clean generated files before submission.

   ```bash
   docker compose down -v
   rm -rf backups build coverage
   rm -rf services/exchange-api/dist services/portal/dist
   rm -rf terraform/local/.terraform
   rm -f hde-audit.log *.log terraform/local/crash.log terraform/local/crash.*.log
   ```

   Do not delete `.env.example`. If you created personal `.env` files, keep them local and out of the submission.

## API Surface

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health/live` | none | Process liveness. |
| `GET` | `/health/ready` | none | Database readiness check. |
| `GET` | `/metrics` | none | Prometheus text metrics. |
| `POST` | `/auth/token` | API key | Issue JWT for a demo organization. |
| `POST` | `/patients` | `hospital`, `agency` | Create or update a patient and audit the action. |
| `GET` | `/patients/:nationalHealthId` | any organization | Read a patient and audit the read. |
| `POST` | `/records` | any organization | Create a clinical record for an active-consent patient, write sync/audit events, and publish to Redis. |
| `GET` | `/records/patient/:nationalHealthId` | any organization | Search active-consent patient records. |
| `GET` | `/compliance/summary` | `agency` only | Counts patients, records, audit events, and sync-event status totals. |
| `GET` | `/compliance/audit-events` | `agency` only | Returns the latest 500 audit events. |

Valid record types are `encounter`, `lab_result`, `prescription`, `claim`, and `immunization`. Patient consent must be `active` before records can be created or returned.

## Local Development Without Compose

Run PostgreSQL and Redis locally or through Compose, then start the API and portal workspaces:

```bash
docker compose up -d postgres redis
npm run dev
npm run portal:dev
```

The API defaults to `postgres://hde:hde_password@localhost:5432/hde` and `redis://localhost:6379`. The Vite dev portal defaults to API base `/api`, so the Compose portal is the simplest full-path demo. For a direct Vite-only setup, set `VITE_API_BASE_URL=http://localhost:8080` before starting the portal.

## More Documentation

- [API examples](docs/api-examples.md)
- [Architecture](docs/architecture.md)
- [Compliance controls](docs/compliance-controls.md)
- [Disaster recovery](docs/disaster-recovery.md)
- [Local Kubernetes](docs/local-kubernetes.md)
- [Submission cleanup](docs/submission-cleanup.md)
