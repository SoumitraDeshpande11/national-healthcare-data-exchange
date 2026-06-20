# Compliance Controls

This project demonstrates engineering controls commonly expected in a regulated healthcare exchange. It is not certified, does not claim regulatory compliance, and must not process real patient data.

## Implemented Controls

| Control | Evidence in repo | How to verify |
| --- | --- | --- |
| Repository ownership | `.github/CODEOWNERS` | `test -f .github/CODEOWNERS` |
| Pull request governance | `.github/pull_request_template.md` | Review checklist file. |
| CI validation | `.github/workflows/ci.yml` | Runs install, lint, tests, compliance check, and container build. |
| Jenkins pipeline | `Jenkinsfile` | Runs install, app validation, manifest validation, build, and optional scan/deploy/Terraform stages. |
| Authentication | `/auth/token`, `services/exchange-api/src/services/auth.ts` | Exchange a demo API key for a JWT. |
| Authorization | `requireAuth`, `requireOrgTypes`, patient access grants | Call `/compliance/summary` with a hospital token and expect `403`; run `npm run validate:api-authorization`. |
| Patient consent and grants | `authorization.ts`, `records.ts`, `documents.ts`, `patients.ts` | Try to create or read data for a revoked or ungranted patient and expect `403`. |
| Audit logging | `writeAudit` calls in route handlers | Run `bash scripts/compliance-check.sh`. |
| Audit review | `/compliance/audit-events` | Call with an agency token. |
| Metrics | `/metrics`, Prometheus config | `curl -sS http://localhost:8080/metrics \| head`. |
| Network segmentation example | `kubernetes/base/networkpolicy.yaml` | `kubectl apply -k kubernetes/base`. |
| Runtime security examples | Restricted pod-security labels and workload security contexts | Inspect `kubernetes/base/namespace.yaml` and workload manifests. |
| Secrets posture example | Kubernetes Secrets and Vault policy | Inspect `kubernetes/base/secrets.yaml` and `security/vault/policies.hcl`. |
| Disaster recovery | Backup, restore, failover scripts | Run `npm run dr:backup` and `bash scripts/failover-drill.sh`. |

## Security Boundary Notes

- The controls are reviewable implementation evidence, not compliance certification evidence.
- Local demo API keys, Grafana credentials, MinIO credentials, Vault root token, and Kubernetes Secret values are static and intentionally easy to inspect.
- Compose endpoints use local HTTP. TLS, mTLS, certificate management, and ingress policy are out of scope for the current implementation.
- Authorization is enforced by Express middleware, route checks, patient grants, and role/type permissions. It does not include a separate policy engine, external identity provider, break-glass workflow, or tenant isolation review.
- Backups, Docker volumes, and audit log files are local filesystem artifacts and are not encrypted by this project.

## Automated Compliance Check

Run:

```bash
bash scripts/compliance-check.sh
```

The script checks that required governance files exist, scans the repo for obvious AWS/private-key secret material while excluding generated/dependency paths, confirms route handlers contain `writeAudit(` calls, and runs HTTP-level authorization tests.

Expected success output:

```text
compliance validation passed
```

## Manual Role Check

```bash
export HOSPITAL_TOKEN="$(
  curl -sS -X POST http://localhost:8080/auth/token \
    -H 'content-type: application/json' \
    -d '{"apiKey":"hospital-local-api-key"}' | jq -r '.accessToken'
)"

curl -i http://localhost:8080/compliance/summary \
  -H "authorization: Bearer $HOSPITAL_TOKEN"
```

Expected result: HTTP `403`.

## Manual Audit Check

```bash
export AGENCY_TOKEN="$(
  curl -sS -X POST http://localhost:8080/auth/token \
    -H 'content-type: application/json' \
    -d '{"apiKey":"agency-local-api-key"}' | jq -r '.accessToken'
)"

curl -sS http://localhost:8080/compliance/audit-events \
  -H "authorization: Bearer $AGENCY_TOKEN" | jq '.auditEvents[0]'
```

You should see the newest audit event with fields such as `action`, `resourceType`, `resourceId`, `ipAddress`, `metadata`, and `createdAt`.

## Hardening Still Required Before Any Real Deployment

- Replace static local demo secrets with dynamic Vault or cloud secret-manager credentials.
- Add TLS or mTLS at ingress and service-to-service boundaries.
- Use KMS-backed encryption for database volumes, object storage, and backups.
- Implement full consent lifecycle workflows, including revocation propagation and retention policy.
- Add SAST, DAST, container image signing, SBOM generation, admission policies, and vulnerability gates.
- Wire application logs into Elasticsearch/Kibana or a managed log platform.
- Expand unit and integration tests into a broader end-to-end suite with real database fixtures and browser automation.
- Run timed DR exercises with measured RPO/RTO evidence.
