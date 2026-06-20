# Architecture

The National Healthcare Data Exchange is implemented as a local, containerized demonstration platform. It keeps the shape of a regulated national interoperability system while using laptop-friendly services instead of managed cloud services.

## Runtime Components

| Component | Implementation | Runtime role |
| --- | --- | --- |
| Portal | React app served by Nginx | Demo UI for organization personas, login, patient upsert, access grants, record publishing/search, document exchange, compliance summary, and audit review. |
| Exchange API | TypeScript, Express, Zod, pg, Redis, prom-client | Authenticates organizations, enforces roles and patient grants, manages patients, records, documents, writes audits, publishes sync events, exposes metrics. |
| PostgreSQL | `postgres:16-alpine` | Source of truth for organizations, patient grants, patients, clinical records, document metadata, sync events, and audit logs. |
| Redis | `redis:7-alpine` | Pub/sub channel for `patient-record-sync` events after record creation. |
| Sync worker | Node.js worker using Redis and PostgreSQL | Subscribes to `patient-record-sync` and marks queued sync events as published. |
| MinIO | S3-compatible object store | Local object storage for uploaded patient documents. PostgreSQL stores document metadata and checksums. |
| Vault | HashiCorp Vault dev server | Demonstrates secret policy and bootstrap workflow. |
| Prometheus | Prometheus container | Scrapes `exchange-api:8080/metrics` and Jenkins `/prometheus/` metrics. |
| Grafana | Grafana container | Local monitoring UI with a provisioned Prometheus datasource and API/Jenkins dashboard panels. |
| Jenkins | Custom Jenkins LTS container | Runs a local pipeline for install, validation, builds, manifest rendering, optional smoke tests, image scans, Terraform, and local Kubernetes deploys; exposes Prometheus metrics. |
| Elasticsearch/Kibana | Elastic containers plus Filebeat | Local log-search stack for API and audit log files. |
| Kubernetes | Kustomize manifests | Local orchestration target for API, PostgreSQL, Redis, MinIO, RBAC, network policy, and HPA. |
| Terraform | Kubernetes and Helm providers | Local governance namespace/config map and optional monitoring stack install. |

## API Flow

1. An organization posts its demo API key to `/auth/token`.
2. The API hashes the key, looks up the organization, writes a `token.issue` audit event, and returns a one-hour JWT.
3. Protected routes require `Authorization: Bearer <token>`.
4. Authenticated users can call `/auth/organizations` to populate access-grant workflows.
5. Patient writes are limited to `hospital` and `agency` organizations and grant the writer access to that patient.
6. Hospital or agency users with patient access can grant the patient to another participant through `/patients/:nationalHealthId/access-grants`.
7. Patient, record, and document reads require active patient consent plus either an agency token or an active patient access grant.
8. Record and document creation also enforce organization type rules, such as labs creating `lab_result` records and `lab_report` documents.
9. Record creation stores a JSONB clinical record, creates a queued sync-event row, publishes to Redis on `patient-record-sync`, and writes a `record.create` audit event.
10. Document upload stores the file in MinIO, stores metadata/checksum in PostgreSQL, creates a queued sync-event row, publishes to Redis, and writes a `document.upload` audit event.
11. The sync worker consumes Redis sync messages and marks the matching sync-event row as `published`.
12. Agency-only compliance routes summarize counts and return the latest audit events.

## Database Model

Migrations run on API startup from `services/exchange-api/src/db/migrate.ts`.

- `organizations`: seeded demo participants with SHA-256 API key hashes.
- `patients`: patient registry keyed by `national_health_id`.
- `patient_access_grants`: active/revoked organization access grants per patient.
- `clinical_records`: JSONB clinical records linked to patients and source organizations.
- `patient_documents`: document metadata, source organization, object key, size, and checksum.
- `sync_events`: record synchronization events and status.
- `audit_logs`: database audit trail for token, patient, and record actions.

The audit service also appends newline-delimited JSON to `AUDIT_LOG_PATH`, defaulting to `/tmp/hde-audit.log`.

## Security Boundaries

- Demo API keys are not stored in plaintext in PostgreSQL; seeded keys are hashed with SHA-256. The plaintext keys are intentionally documented for local testing.
- JWTs are signed with `JWT_SECRET`, expire after one hour, and identify the organization id, name, and type. The local default secret is not appropriate outside this demo.
- Route middleware enforces authentication and role checks within the API.
- Agency-only routes are `/compliance/summary` and `/compliance/audit-events`.
- Patient, record, and document workflows check active consent and patient access grants.
- Record/document creation checks organization type permissions before writing data.
- Kubernetes manifests include Secrets, RBAC, security context settings, and a default-deny style NetworkPolicy example.
- Vault files demonstrate a KV policy and local bootstrap for API secrets.
- Local Compose traffic is plain HTTP on host ports. Local database volumes, object storage, audit log files, and backup files are not encrypted by this project.
- The implementation is not a HIPAA, ABDM, NHS, or other regulatory certification boundary.

## Observability

The API installs request metrics middleware and exposes Prometheus text metrics at `/metrics`. Jenkins exposes CI metrics through the Jenkins Prometheus plugin at `/prometheus/`. Prometheus uses `docker/prometheus/prometheus.yml` to scrape both services. Grafana runs locally on port `3000` with `soumitra/deshpande` and provisions the `Healthcare Exchange API` dashboard from `docker/grafana/provisioning`.

Logs are emitted through Pino. Filebeat reads the API and audit log files from the shared log volume and ships them into Elasticsearch for Kibana exploration.

`npm run validate:integrations` verifies the runtime connections: MinIO write/read/delete, Vault KV policy and secret readback, Jenkins job/tooling, Redis sync-worker publication, Prometheus API and Jenkins targets, Grafana datasource proxy, Kibana availability, and Elasticsearch log ingestion from Filebeat.

## Local To Production-Style Mapping

| Production-style need | Local demonstration |
| --- | --- |
| Managed Kubernetes | Local Kubernetes manifests under `kubernetes/base`. |
| Managed relational database | PostgreSQL container or StatefulSet. |
| Object storage | MinIO. |
| Secret management | Vault policy/bootstrap examples and Kubernetes Secrets. |
| API gateway or ingress | Nginx portal proxy plus Kubernetes Service-ready API. |
| Metrics and dashboards | Prometheus and Grafana. |
| Log search | Elasticsearch and Kibana containers. |
| Governance as code | CODEOWNERS, GitHub Actions workflow, Jenkins service/Jenkinsfile, Terraform namespace labels, quota, limit range, and governance config map. |
| Disaster recovery | Backup, restore, and failover drill scripts. |

## Known Demo Boundaries

- This is not a certified medical system and must not process real patient data.
- The record model is intentionally compact JSONB, not full FHIR.
- MinIO document storage is implemented for demo uploads, but it is not encrypted for real patient data.
- Elasticsearch/Kibana log forwarding is local-only and not a tamper-resistant audit archive.
- Local secrets are intentionally static for repeatable demos and must be replaced before any real deployment.
- Disaster-recovery scripts demonstrate backup and restore mechanics; they do not provide measured production RPO/RTO guarantees.
