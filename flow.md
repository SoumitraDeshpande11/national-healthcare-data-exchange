# National Healthcare Data Exchange - Presentation Flow

## 1. Project In One Line

The National Healthcare Data Exchange is a local, production-style DevOps platform that demonstrates how hospitals, laboratories, pharmacies, insurers, and a government health agency can securely exchange patient records with authentication, role-based access, audit logging, monitoring, CI/CD, containerization, Kubernetes manifests, infrastructure as code, and disaster-recovery workflows.

This project is built as a runnable system, not only a written case study. It runs locally through Docker Compose and includes API services, frontend portal, database, object storage, secret management, CI/CD, observability, log search, and validation scripts.

Important boundary: this is a local academic demonstration. It must not be used with real patient data because it is not certified, legally audited, or hardened like a real national healthcare system.

## 2. Problem Statement Mapping

| Requirement from problem statement | Project implementation |
| --- | --- |
| Secure patient record exchange | Express API with JWT authentication, organization API keys, RBAC, patient consent checks, patient access grants, and audit logs. |
| Hospitals, labs, pharmacies, insurers, government agency | Seeded demo organizations: National Health Agency, Metro General Hospital, Apex Diagnostic Lab, CarePlus Pharmacy, and Unified Health Insurance. |
| Legacy hospital integration | REST API endpoints represent integration points for external hospital/lab/pharmacy/insurance systems. |
| Data privacy regulations | Role checks, consent checks, access grants, audit trail, compliance summary, and security headers through Helmet. |
| Secure API communication | Token-based API access, CORS restrictions, request validation with Zod, and audit logging. Local demo uses HTTP; production would require TLS/API Gateway. |
| Real-time patient record synchronization | Record/document writes create `sync_events`, publish Redis messages, and a sync worker consumes them. |
| Disaster recovery mandates | Backup, restore, and failover drill scripts for local recovery demonstration. |
| High-volume data ingestion | Containerized API, PostgreSQL, Redis pub/sub, metrics, Docker, Kubernetes manifests, and horizontal scaling examples. |
| Cloud-native DevOps platform | Docker, Jenkins, GitHub Actions, Kubernetes manifests, Terraform, Vault, Prometheus, Grafana, ELK, MinIO, and automated validation. |

## 3. High-Level Architecture

```text
Users / Faculty Demo
        |
        v
React Portal on Nginx
http://localhost:5173
        |
        | /api proxy
        v
Exchange API - TypeScript + Express
http://localhost:8080
        |
        |-- PostgreSQL: patients, records, documents metadata, sync events, audit logs
        |-- Redis: patient-record-sync pub/sub channel
        |-- Sync Worker: consumes Redis events and marks sync_events as published
        |-- MinIO: uploaded healthcare document objects
        |-- Vault: runtime secrets for API configuration
        |-- Prometheus: API/Jenkins metrics scraping
        |-- Filebeat -> Elasticsearch -> Kibana: API and audit log search
        |
        v
Grafana Dashboards / Jenkins Pipeline / DR Scripts / Kubernetes / Terraform
```

The platform has two main sides:

1. Product side: portal, API, database, object storage, patient records, document exchange, consent, and compliance.
2. DevOps side: Docker, Jenkins, GitHub Actions, Kubernetes, Terraform, Vault, Prometheus, Grafana, ELK, backup/restore, and validation scripts.

## 4. Runtime Components

| Component | Technology | Why it is used |
| --- | --- | --- |
| Frontend portal | React, TypeScript, Vite, Nginx | Gives users a product-like interface for login, patient registration, record publishing, document workflows, audit review, and compliance summary. |
| Backend API | Node.js, TypeScript, Express | Main healthcare exchange service. Handles auth, patients, records, documents, audit, health checks, and metrics. |
| Validation | Zod | Validates incoming API request bodies before data is accepted. |
| Security middleware | Helmet, CORS, JWT | Adds HTTP security headers, limits browser origins, and protects routes with signed tokens. |
| Database | PostgreSQL | System of record for healthcare entities, patient registry, records, document metadata, grants, sync events, and audit logs. |
| Cache/event bus | Redis | Pub/sub channel for real-time synchronization events. |
| Sync worker | Node.js worker | Subscribes to Redis sync messages and updates event status to prove the synchronization flow works. |
| Object storage | MinIO | Local S3-compatible storage for uploaded patient documents. |
| Secrets | Vault | Stores API runtime secrets in a secret-management service instead of hardcoding every runtime secret directly into the API container. |
| Containers | Docker | Packages services consistently so the whole platform runs locally. |
| Local orchestration | Docker Compose | Starts the complete stack together with health checks and dependencies. |
| Kubernetes | Kustomize YAML manifests | Shows how the platform would be orchestrated with Deployments, Services, Secrets, RBAC, NetworkPolicy, HPA, and CronJob. |
| Infrastructure as Code | Terraform | Validates local platform governance resources and optional monitoring infrastructure definitions. |
| CI/CD | Jenkins | Primary local pipeline server for install, validation, builds, Kubernetes render, Terraform validation, running-platform verification, optional Trivy, and optional deploy. |
| Repository CI | GitHub Actions | Backup repository CI for validation, build, Docker image build, Terraform validation, Kubernetes render, and live smoke checks. |
| Metrics | Prometheus | Scrapes API and Jenkins metrics. |
| Dashboards | Grafana | Visualizes request rate, latency, patient registrations, records, auth failures, uploads, Jenkins health, queue, and memory. |
| Logs | Filebeat, Elasticsearch, Kibana | Ships API/audit logs to Elasticsearch and lets us search them in Kibana. |
| Disaster recovery | Shell scripts | Demonstrates backup, restore, and failover drills. |

## 5. Healthcare Product Features

### Organization Personas

The system models five participant types:

| Organization | Type | Example use |
| --- | --- | --- |
| National Health Agency | `agency` | Compliance monitoring and national oversight. |
| Metro General Hospital | `hospital` | Patient registration and clinical encounter publishing. |
| Apex Diagnostic Lab | `laboratory` | Lab results and lab report documents. |
| CarePlus Pharmacy | `pharmacy` | Prescriptions and prescription scans. |
| Unified Health Insurance | `insurer` | Insurance claims and insurance documents. |

### Authentication Flow

```text
Organization enters demo API key
        |
        v
POST /auth/token
        |
        v
API hashes the key and compares it with PostgreSQL
        |
        v
API returns a one-hour JWT
        |
        v
Portal sends JWT in Authorization header for protected routes
```

Why this matters: in a real integration, each hospital/lab/pharmacy system would authenticate before exchanging data.

### Patient Registration Flow

```text
Hospital or agency logs in
        |
        v
POST /patients
        |
        v
API validates request using Zod
        |
        v
Patient is inserted or updated in PostgreSQL
        |
        v
The creating organization receives patient access
        |
        v
Audit event is written
        |
        v
Prometheus counter is updated
```

Only hospitals and agencies can create/update patients. This models controlled patient registry operations.

### Access Grant Flow

```text
Hospital or agency has access to a patient
        |
        v
POST /patients/:nationalHealthId/access-grants
        |
        v
Another organization receives access to that patient
        |
        v
Grant is stored in patient_access_grants
        |
        v
Audit event records who granted access
```

This models interoperability: one organization can grant another organization access to a patient record when consent and policy allow it.

### Record Exchange Flow

```text
Authenticated organization creates a record
        |
        v
API checks:
- valid JWT
- organization type permission
- active patient consent
- patient access grant
        |
        v
Record is stored in PostgreSQL clinical_records
        |
        v
sync_events row is created with status = queued
        |
        v
Redis message is published on patient-record-sync
        |
        v
sync-worker consumes the message
        |
        v
sync_events status becomes published
        |
        v
Audit log and metrics are updated
```

This is the main real-time synchronization demonstration.

### Document Exchange Flow

```text
Organization uploads a document
        |
        v
API validates document type and patient access
        |
        v
File checksum is calculated with SHA-256
        |
        v
File object is stored in MinIO
        |
        v
Metadata is stored in PostgreSQL patient_documents
        |
        v
Redis sync event is published
        |
        v
sync-worker marks event as published
        |
        v
Audit log and upload metrics are updated
```

MinIO represents the kind of object storage a production platform would use for reports, prescriptions, discharge summaries, and insurance documents.

### Compliance Flow

```text
Agency user logs in
        |
        v
GET /compliance/summary
GET /compliance/audit-events
        |
        v
API confirms agency role
        |
        v
Counts and latest audit events are returned
```

This gives the government agency oversight into records, patients, sync status, and audit events.

## 6. DevOps Tooling Explained

### GitHub

Used for source control and repository governance.

Implemented items:

- `.github/workflows/ci.yml` for automated CI.
- `.github/CODEOWNERS` for ownership/governance.
- Pull request template for structured reviews.
- GitHub Actions run validates the project on push.

What faculty can see:

- Repository history.
- CI run status.
- Build/test validation.
- Docker build validation.
- Terraform and Kubernetes validation in CI.

### GitHub Actions

GitHub Actions validates the repo automatically. In this project it is the repository-side backup validator, while Jenkins is the self-hosted CI/CD pipeline that represents the agency-controlled build system.

Pipeline jobs:

1. Install dependencies.
2. Run `npm run validate`.
3. Build API and portal.
4. Render Kubernetes manifests with `kubectl kustomize`.
5. Run Terraform `fmt`, `init`, and `validate`.
6. Build API Docker image.
7. Build portal Docker image.
8. Start a partial live stack.
9. Run smoke tests.

Latest verified run:

```text
https://github.com/SoumitraDeshpande11/national-healthcare-data-exchange/actions
```

### Docker

Docker packages each runtime component.

Main containers:

- `exchange-api`
- `portal`
- `postgres`
- `redis`
- `sync-worker`
- `minio`
- `vault`
- `jenkins`
- `prometheus`
- `grafana`
- `elasticsearch`
- `kibana`
- `filebeat`

Why Docker matters: the entire platform can run consistently on a laptop without installing each service manually.

### Docker Compose

Docker Compose is the main local runtime.

It defines:

- Service images/builds.
- Ports.
- Volumes.
- Health checks.
- Startup dependencies.
- Local credentials.
- Shared API log volume.

Start command:

```bash
docker compose up -d --build
```

Status command:

```bash
docker compose ps
```

### Jenkins

Jenkins is the local CI/CD server.

URL:

```text
http://localhost:8081
```

Login:

```text
soumitra / deshpande
```

Pipeline job:

```text
national-healthcare-data-exchange
```

Jenkinsfile stages:

1. Checkout.
2. Install dependencies.
3. Application validation.
4. Build applications.
5. Kubernetes manifest validation.
6. Terraform validation.
7. Running platform verification through `npm run validate:jenkins-platform`.
8. Build API and portal containers.
9. Optional live integration smoke test.
10. Optional Trivy security scan.
11. Optional deploy to local Kubernetes.
12. Archive artifacts.

How Jenkins fits: Jenkins represents the agency's controlled deployment pipeline. GitHub Actions still validates code in the repository, but Jenkins is the primary self-hosted CI/CD path for the demo.

### Kubernetes

Kubernetes manifests are under:

```text
kubernetes/base
```

They include:

- Namespace.
- RBAC.
- Secrets.
- ConfigMap.
- PostgreSQL.
- Redis.
- MinIO.
- API Deployment and Service.
- Portal Deployment and Service.
- NetworkPolicy.
- HorizontalPodAutoscaler.
- Backup CronJob.

Validation command:

```bash
kubectl kustomize kubernetes/base
```

How Kubernetes fits: Docker Compose runs the local demo, while Kubernetes manifests show the cloud-native orchestration design for multi-service deployment.

### Terraform

Terraform files are under:

```text
terraform/local
```

Terraform is used for local infrastructure/governance validation:

- Kubernetes namespace governance.
- Labels/metadata.
- ConfigMap policy values.
- Optional Helm-based monitoring stack.

Validation commands:

```bash
terraform -chdir=terraform/local fmt -check
terraform -chdir=terraform/local init -backend=false
terraform -chdir=terraform/local validate
```

How Terraform fits: it demonstrates Infrastructure as Code. Since this version avoids AWS, Terraform is not provisioning cloud resources; it validates local Kubernetes/governance infrastructure definitions.

### Vault

Vault provides secret-management demonstration.

URL:

```text
http://localhost:8200
```

Token:

```text
root
```

Secret path used by the local stack:

```text
secret/hde/exchange-api
```

Secrets stored:

- Database URL.
- Redis URL.
- JWT secret.
- MinIO endpoint.
- MinIO access key.
- MinIO secret key.
- MinIO bucket.
- Allowed origins.
- Audit log path.

How Vault fits: instead of keeping all runtime configuration directly in the API container, the API reads its sensitive configuration from Vault during startup.

### Prometheus

Prometheus scrapes metrics from:

| Job | Target |
| --- | --- |
| `exchange-api` | `exchange-api:8080/metrics` |
| `jenkins` | `jenkins:8080/prometheus/` |

URL:

```text
http://localhost:9090
```

What to show:

- Go to Status -> Targets.
- Show `exchange-api` target is UP.
- Show `jenkins` target is UP.
- Query API request metrics.

How Prometheus fits: it collects time-series operational data from the healthcare platform and CI/CD server.

### Grafana

Grafana visualizes Prometheus metrics.

URL:

```text
http://localhost:3000
```

Login:

```text
soumitra / deshpande
```

Dashboard:

```text
Healthcare Exchange API
```

Dashboard panels include:

- HTTP duration p95.
- Request rate.
- Patient registrations.
- Record publications.
- Auth failures.
- Document upload attempts.
- 24-hour registration/record/upload/auth counts.
- API target status.
- Jenkins target status.
- Jenkins executors.
- Jenkins queue.
- API memory.
- Jenkins jobs and runs.

How Grafana fits: it is the main visual dashboard for faculty demonstration.

### ELK Stack

This project uses:

- Filebeat for log shipping.
- Elasticsearch for log storage/search.
- Kibana for log exploration.

Kibana URL:

```text
http://localhost:5601
```

Log flow:

```text
API writes logs to /var/log/hde/api.log and /var/log/hde/audit.log
        |
        v
Filebeat reads those files
        |
        v
Elasticsearch indexes them
        |
        v
Kibana searches them
```

How ELK fits: it gives operators searchable application and audit logs.

### MinIO

MinIO is local S3-compatible object storage.

URL:

```text
http://localhost:9001
```

Login:

```text
soumitra / deshpande
```

Bucket:

```text
healthcare-documents
```

How MinIO fits: uploaded documents are stored as objects, while PostgreSQL stores document metadata and checksum.

### PostgreSQL

PostgreSQL is the source of truth.

It stores:

- Organizations.
- Patients.
- Patient access grants.
- Clinical records.
- Patient document metadata.
- Sync events.
- Audit logs.

Why PostgreSQL fits: healthcare records need durable structured storage, relational constraints, audit queries, and transactional writes.

### Redis

Redis is used as a pub/sub event bus.

Channel:

```text
patient-record-sync
```

Flow:

```text
API creates record/document
        |
        v
API publishes Redis event
        |
        v
sync-worker receives event
        |
        v
sync-worker updates sync_events status
```

Why Redis fits: it demonstrates real-time synchronization without tightly coupling every downstream consumer to the API request.

## 7. Security Design

Implemented security concepts:

- API key to JWT exchange.
- SHA-256 hashed demo API keys in PostgreSQL.
- JWT expiry.
- RBAC by organization type.
- Patient consent enforcement.
- Patient access grant checks.
- Organization-specific record/document permissions.
- Helmet security headers.
- CORS allowed origins.
- Request body validation.
- Audit logs in database and file logs.
- Vault-backed runtime secrets.
- Kubernetes RBAC and NetworkPolicy examples.
- Docker health checks.

Local demo limitations:

- Local services use HTTP, not HTTPS.
- Static demo credentials are used for repeatable faculty demo.
- Vault runs in dev mode.
- Local volumes/backups are not encrypted.
- This is not regulatory certification.

## 8. Observability Design

Observability means the platform can be inspected while running.

Metrics path:

```text
API -> /metrics -> Prometheus -> Grafana
Jenkins -> /prometheus/ -> Prometheus -> Grafana
```

Logs path:

```text
API/audit log files -> Filebeat -> Elasticsearch -> Kibana
```

Health checks:

- API liveness: `GET /health/live`.
- API readiness: `GET /health/ready`.
- Docker Compose health checks for core services.
- Prometheus target health.
- Grafana health API.
- Jenkins health API.
- Kibana status API.

## 9. Disaster Recovery Design

Scripts:

| Script | Purpose |
| --- | --- |
| `scripts/backup-local.sh` | Creates a PostgreSQL dump and attempts MinIO mirror backup. |
| `scripts/restore-local.sh` | Restores PostgreSQL from a backup directory. |
| `scripts/failover-drill.sh` | Restarts API service and runs smoke test. |

Commands:

```bash
npm run dr:backup
npm run dr:restore -- backups/<backup-folder>
bash scripts/failover-drill.sh
```

How this fits: it demonstrates backup/restore/failover procedure required by the problem statement, but it is still a local DR demonstration rather than a measured enterprise DR system.

## 10. End-To-End Demo Script

Use this order for a presentation.

### Step 1: Show Running Containers

```bash
docker compose ps
```

Explain that the platform is made of multiple real services running locally.

### Step 2: Open The Product Portal

```text
http://localhost:5173
```

Show:

- Login/persona selection.
- Patient registration.
- Record creation/search.
- Document upload/search.
- Compliance/audit section.

### Step 3: Show API Health

```bash
curl -sS http://localhost:8080/health/live
curl -sS http://localhost:8080/health/ready
```

Explain:

- Live means the process is running.
- Ready means dependencies such as PostgreSQL are reachable.

### Step 4: Seed A Demo Patient And Record

```bash
bash scripts/seed-demo.sh
```

Explain:

- Hospital logs in.
- Patient is created.
- Access grants are created.
- Encounter record is published.

### Step 5: Validate Integrations

```bash
npm run validate:integrations
```

This proves:

- MinIO works.
- Vault works.
- Jenkins works.
- Redis sync worker works.
- Prometheus works.
- Grafana works.
- Kibana works.
- Filebeat/Elasticsearch log ingestion works.

### Step 6: Show Grafana

```text
http://localhost:3000
```

Open dashboard:

```text
Healthcare Exchange API
```

Show:

- API request rate.
- Latency.
- Patient registrations.
- Record publications.
- Auth failures.
- Upload attempts.
- Jenkins status.

### Step 7: Show Prometheus Targets

```text
http://localhost:9090
```

Show:

- `exchange-api` target UP.
- `jenkins` target UP.

### Step 8: Show Jenkins Pipeline

```text
http://localhost:8081
```

Open:

```text
national-healthcare-data-exchange
```

Explain pipeline stages from the Jenkinsfile.

### Step 9: Show MinIO

```text
http://localhost:9001
```

Explain that healthcare document files go to object storage, not directly into the database.

### Step 10: Show Vault

```text
http://localhost:8200
```

Explain that runtime secrets are stored in Vault under:

```text
secret/hde/exchange-api
```

### Step 11: Show Kibana

```text
http://localhost:5601
```

Explain:

- API/audit logs are forwarded by Filebeat.
- Elasticsearch stores them.
- Kibana searches them.

### Step 12: Show GitHub Actions

```text
https://github.com/SoumitraDeshpande11/national-healthcare-data-exchange/actions
```

Explain:

- CI runs on push.
- It validates TypeScript/tests/compliance.
- It builds API and portal.
- It validates Terraform.
- It renders Kubernetes manifests.
- It builds Docker images.
- It performs live smoke checks.

## 11. Validation Commands

Run these before the demo:

```bash
npm run validate
npm run build
npm run validate:integrations
bash scripts/smoke-test.sh
docker compose ps
kubectl kustomize kubernetes/base > /tmp/kubernetes-rendered.yaml
terraform -chdir=terraform/local fmt -check
terraform -chdir=terraform/local init -backend=false
terraform -chdir=terraform/local validate
```

Expected result: all should complete successfully when Docker services are running and optional tools are installed.

## 12. Service URLs And Credentials

| Service | URL | Credentials |
| --- | --- | --- |
| Product portal | `http://localhost:5173` | Demo personas/API keys in portal/README. |
| API | `http://localhost:8080` | JWT via `/auth/token`. |
| Grafana | `http://localhost:3000` | `soumitra` / `deshpande` |
| Jenkins | `http://localhost:8081` | `soumitra` / `deshpande` |
| Prometheus | `http://localhost:9090` | No login in local demo. |
| MinIO | `http://localhost:9001` | `soumitra` / `deshpande` |
| Vault | `http://localhost:8200` | token: `root` |
| Kibana | `http://localhost:5601` | No login in local demo. |

## 13. What To Say To Faculty

Short explanation:

> We built a local cloud-native healthcare data exchange platform. The frontend portal talks to an authenticated API. The API enforces organization roles, patient consent, and patient access grants. Patient records are stored in PostgreSQL, documents are stored in MinIO, sync events are published through Redis, and a sync worker processes them. Every important action writes audit logs and metrics. Prometheus scrapes metrics, Grafana visualizes dashboards, and Filebeat sends logs to Elasticsearch for Kibana search. Jenkins and GitHub Actions validate the system, Docker packages it, Kubernetes manifests show orchestration, and Terraform validates infrastructure-as-code governance.

## 14. Honest Limitations

Be clear about these points if asked:

- This is a production-style local project, not a certified national healthcare system.
- It uses compact JSON records, not full FHIR/HL7 interoperability standards.
- Local demo uses HTTP and static credentials for repeatability.
- Vault is real locally but runs in development mode.
- Kubernetes manifests are valid, but Docker Compose is the primary local runtime.
- Terraform is used for local governance/validation, not AWS cloud provisioning.
- Disaster recovery is demonstrated locally but does not guarantee production RPO/RTO.
- Kibana is connected for log search, while Grafana is the main polished dashboard.

## 15. Final System Flow Summary

```text
GitHub push
  -> GitHub Actions validates code, builds containers, validates Terraform/Kubernetes, smoke-tests API

Developer/faculty starts Docker Compose
  -> PostgreSQL, Redis, MinIO, Vault, API, Portal, Jenkins, Prometheus, Grafana, ELK start

User opens portal
  -> Logs in as organization
  -> API issues JWT
  -> User registers patient / grants access / creates record / uploads document

API processing
  -> Validates request
  -> Checks role, consent, and grants
  -> Writes PostgreSQL data
  -> Stores files in MinIO
  -> Publishes Redis sync event
  -> Writes audit log
  -> Exposes metrics

Sync and observability
  -> sync-worker consumes Redis event
  -> Prometheus scrapes API/Jenkins metrics
  -> Grafana displays dashboards
  -> Filebeat ships logs to Elasticsearch
  -> Kibana searches logs

Operations
  -> Jenkins runs local pipeline
  -> Kubernetes manifests define orchestration
  -> Terraform validates IaC governance
  -> Backup/restore/failover scripts demonstrate DR
```
